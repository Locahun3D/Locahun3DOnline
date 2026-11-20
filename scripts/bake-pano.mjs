// 公開シーンの「開始位置の 360° 画像」を作る（2026-11-10 本人「この静止画を最初に挟むの、locahunでも採用」）。
//
// ビューアー（Locahun3D src/js/292b_start_pano.js）は開いた直後、シーンの中身の識別子から決まる 64 桁のキーで
// /api/pano/<key>.json と /api/pano/<key>-{f,r,b,l,u,d}.jpg を取りに来て、あれば 3D の上にかぶせる
// （その場で見回す間は画像のまま裏で 3D を読み、位置が動いたら 3D に切り替える）。
// このスクリプトは本番のシーンを実ブラウザ（Chrome・画面あり・GPU）で開き、ビューアー自身が計算したキーと開始位置で、
// 3D が最大まで細かくなるのを待ってから 6 方向（各 90°・1024px）を撮り、R2 に新しいキーとして追加する。
//
//   node scripts/bake-pano.mjs --all                 全公開シーンを ok / missing で一覧
//   node scripts/bake-pano.mjs --all --fix           無いものだけ作って R2 に追加
//   node scripts/bake-pano.mjs --property studio-babel[,slug2] [--fix]
//   node scripts/bake-pano.mjs --scene /api/viewer-stream/assets/splat/<zip> [--fix]   （登録・差し替え直後もこれ）
//   node scripts/bake-pano.mjs --property <slug> --local    R2 に書かず artifacts/pano/<key先頭16桁>/ にだけ作る
//   オプション: --limit N / --size 1024 / --quality 82 / --viewer <html>|prod / --out artifacts/pano
//
// R2 への書き込みは「新しいキーの追加」だけ（pano/<key>-<面>.jpg を先に、最後に pano/<key>.json）。
// ビューアーは json を見てから画像を取るので、途中で止まっても半端な状態は使われない。既にあるキーは上書きしない。
// R2 の鍵は Windows のユーザー環境変数 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET（表示しない）。
// 撮影中は /api/pano を 404 にして画像を出さず（3D そのものを撮る）、?nopano は付けない（キーの計算は要る）。
//
// --points（2026-11-19 本人「360画像と3DGSの移行の仕組みをロケハン3Dでも」「地点は自動で選ぶ」）:
//   軽量表示（弱い端末で 3D を読まない時）の 360° 写真ツアー用に、開始位置の周りの地点も撮る（読み込み中のツアーは ?pre=1 のときだけ。2026-11-20）。地点はビューアーの __startPano.pickPoints()
//   （床の当たり判定から、歩けて見通せる所を 2.5m 以上離して最大 8 か所）が選ぶ。
//   R2 は pano/<key>-<地点>-<面>.jpg を先に、最後に pano/<key>.points.json（これがあれば使われる）。開始位置の画像が既にあれば、その位置から選ぶ。
//   node scripts/bake-pano.mjs --property <slug> --points --local   試し撮り（artifacts/pano/<key先頭16桁>/ に p1-f.jpg … points.json）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { PAGE_CANDS, strip, map as drawMap, review as aiReview, gapPositions, limits } from './tour-ai.mjs';

const require = createRequire(import.meta.url);
const { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://locahun3d.com';
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const FIX = flag('--fix') || flag('--local');
const POINTS = flag('--points');   // ツアーの地点も撮る
const AI = !flag('--no-ai');   // 地点を AI に判定させる（scripts/tour-ai.mjs。2026-11-20）
const REDO = flag('--redo-points');   // 地点を選び直す（今の points.json は R2 に控えを残して置き換える）
const AI_MODEL = arg('--ai-model', '');   // 空なら Claude は fable、Codex は gpt-6-astra
const AI_ENGINE = arg('--ai-engine', 'auto');   // auto = Claude Code → だめなら Codex
const LOCAL = flag('--local');   // R2 に書かず artifacts/pano/ にだけ作る（試し撮り・見比べ用）
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const SIZE = Number(arg('--size', 1024));
const QUALITY = Number(arg('--quality', 82));
const OUT = path.resolve(ROOT, arg('--out', 'artifacts/pano'));
const VIEWER = arg('--viewer', path.join(ROOT, 'public/viewer/offline-viewer.html'));
fs.mkdirSync(OUT, { recursive: true });

const C = { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m` };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const FACES = { f: [0, 0], r: [-Math.PI / 2, 0], b: [Math.PI, 0], l: [Math.PI / 2, 0], u: [0, Math.PI / 2], d: [0, -Math.PI / 2] };

// ── R2（鍵は表示しない。collision-check.mjs と同じ） ──
function loadUserEnv() {
  for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET']) {
    if (process.env[name] || process.platform !== 'win32') continue;
    const r = spawnSync('reg', ['query', 'HKCU\\Environment', '/v', name], { encoding: 'utf8' });
    const m = /REG_\w+\s+(.+)\s*$/m.exec(r.stdout || '');
    if (m) process.env[name] = m[1].trim();
  }
  const miss = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET'].filter((n) => !process.env[n]);
  if (miss.length) { console.error(C.red('R2 の環境変数がありません: ' + miss.join(', '))); process.exit(2); }
}
loadUserEnv();
const BUCKET = process.env.R2_BUCKET;
const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
async function r2Head(k) {
  try { return await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: k })); }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null; throw e; }
}
async function r2Json(k) {
  const o = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: k }));
  return JSON.parse(await o.Body.transformToString());
}
async function r2PutNew(k, body, type) {
  // 追加のみ: If-None-Match: * で既存キーへの上書きを R2 側でも拒否させる。
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: body, ContentType: type, Metadata: { sha256: sha(body) }, IfNoneMatch: '*' }));
}

// ── 対象シーン（collision-check.mjs と同じ拾い方） ──
async function text(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }
async function propertyScenes(slug) {
  const html = await text(`${ORIGIN}/properties/${encodeURIComponent(slug)}`);
  return [...new Set([...html.matchAll(/offline-viewer\.html\?autoload=([^"&]+)/g)].map((m) => new URLSearchParams('a=' + m[1].replace(/&amp;/g, '&')).get('a')))]
    .map((scene) => ({ property: slug, scene }));
}
async function listScenes() {
  const out = [];
  if (arg('--scene')) for (const s of arg('--scene').split(',')) out.push({ property: arg('--property', ''), scene: s });
  else if (arg('--property')) for (const slug of arg('--property').split(',')) out.push(...await propertyScenes(slug));
  else if (flag('--all')) {
    const html = await text(`${ORIGIN}/properties`);
    const slugs = [...new Set([...html.matchAll(/href="\/properties\/([^"/?#]+)"/g)].map((m) => m[1]))];
    for (const slug of slugs) out.push(...await propertyScenes(slug));
  } else { console.error('--all / --property <slug> / --scene <autoload> のどれかを指定'); process.exit(2); }
  return out.filter((s) => s.scene.startsWith('/api/viewer-stream/'));
}

// ── ブラウザ ──
const ANCHOR = 'const camPos  = new THREE.Vector3(0, 1.7, 4);';
const HOOK = `;window.__pb={
 n:()=>window.__nSplat?window.__nSplat():-1,
 pose:()=>({x:camPos.x,y:camPos.y,z:camPos.z,yaw:yaw,pitch:pitch}),
 walk:()=>{try{return !!(walkSetup.core&&!walkSetup.importPending);}catch(_){return false;}},
 busy:()=>{try{return sparkRenderer&&sparkRenderer.pager?sparkRenderer.pager.fetchers.filter(f=>f.chunk>=0).length:0;}catch(_){return 0;}},
 budget:(n)=>{try{window._gpuWatchdog=window._gpuWatchdog||{};window._gpuWatchdog.manualOverride=true;sparkRenderer.lodSplatCount=n;return sparkRenderer.lodSplatCount;}catch(_){return -1;}},
 aim:(p,yw,pt)=>{const T=window.__dbg.THREE;if(!window.__pbCam){window.__pbCam=new T.PerspectiveCamera(90,1,0.01,5000);const R=renderer,orig=R.render.bind(R);R.render=(sc,cam)=>orig(sc,cam===camera?window.__pbCam:cam);}
   const c=window.__pbCam;c.aspect=1;c.updateProjectionMatrix();c.position.set(p.x,p.y,p.z);c.rotation.set(pt,yw+Math.PI,0,'YXZ');c.updateMatrixWorld(true);markDirty(30);},
};`;
let viewerHtml = null;
async function getViewerHtml() {
  if (viewerHtml) return viewerHtml;
  const html = VIEWER === 'prod' ? await text(`${ORIGIN}/viewer/offline-viewer.html`) : fs.readFileSync(VIEWER, 'utf8');
  if (!html.includes(ANCHOR)) throw new Error('viewer anchor not found');
  if (!html.includes('__startPano')) throw new Error('この viewer は 360° 画像のキー計算に対応していない（Locahun3D の sync-online-viewer.sh を先に）');
  viewerHtml = html.replace(ANCHOR, ANCHOR + HOOK + PAGE_CANDS);
  return viewerHtml;
}

async function openScene(browser, scene) {
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const html = await getViewerHtml();
  await page.route((u) => u.host === 'locahun3d.com' && ['/viewer/offline-viewer.html', '/viewer/rad-chunk-cache.js'].includes(u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('.js') && VIEWER !== 'prod') return route.fulfill({ status: 200, body: fs.readFileSync(path.join(path.dirname(VIEWER), 'rad-chunk-cache.js')), headers: { 'content-type': 'text/javascript' } });
    if (p.endsWith('.js')) return route.continue();
    return route.fulfill({ status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  // 撮影中は画像を出さない（3D そのものを撮る）
  await page.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/api/pano/'), (route) => route.fulfill({ status: 404, headers: { 'cache-control': 'no-store' }, body: '' }));
  await page.goto(`${ORIGIN}/viewer/offline-viewer.html?autoload=${encodeURIComponent(scene)}&protected=1`, { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
}

// 3D が落ち着く（点数が変わらず取得も止まる）まで待つ
async function settle(page, maxMs) {
  const t0 = Date.now(); let last = -2, same = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(700);
    const s = await page.evaluate(() => ({ n: window.__pb.n(), busy: window.__pb.busy() })).catch(() => null);
    if (s && s.n > 0 && s.n === last && s.busy === 0) { if (++same >= 3) return true; } else same = 0;
    last = s ? s.n : -2;
  }
  return false;
}

// 写りのはっきりさ（4 方向の横の面の、輪郭の強さ＝ラプラシアンの分散の平均）。3D の撮影範囲の外れはぼやけて小さくなる
async function sharpness(faces) {
  let sum = 0;
  for (const k of ['f', 'r', 'b', 'l']) {
    const data = await sharp(faces[k]).greyscale().resize(256, 256).convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }).raw().toBuffer();
    let m = 0; for (const v of data) m += v; m /= data.length;
    let q = 0; for (const v of data) q += (v - m) ** 2;
    sum += q / data.length;
  }
  return sum / 4;
}
const SHARP_MIN = Number(arg('--sharp-min', 0.45));   // 開始位置の何割未満の地点を外すか（会議室の試しで、見てぼやけていた 4 か所が 0.14〜0.34、良い所が 0.59〜0.86）

// 1 か所の 6 方向（各 90°）を撮る
async function capture(page, pos, yaw0, pitch0, r, tag) {
  const faces = {};
  for (const [k, [dy, p]] of Object.entries(FACES)) {
    await page.evaluate(([pos, yw, pt]) => window.__pb.aim(pos, yw, pt), [pos, yaw0 + dy, p + (k === 'u' || k === 'd' ? 0 : pitch0)]);
    const ok = await settle(page, 90000);
    if (!ok) r.slow = (r.slow || '') + tag + k + ' ';
    await page.waitForTimeout(400);
    faces[k] = await page.locator('canvas').first().screenshot({ type: 'jpeg', quality: QUALITY });
  }
  return faces;
}

async function bake(browser, s) {
  const r = { scene: s.scene, property: s.property, at: new Date().toISOString() };
  const { ctx, page, errors } = await openScene(browser, s.scene);
  try {
    // キー（ビューアーが計算したもの）
    let key = null; const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !key) { await page.waitForTimeout(300); key = await page.evaluate(() => window.__startPano?.key || null).catch(() => null);
      const st = await page.evaluate(() => window.__startPano?.state).catch(() => null); if (st === 'none' && !key) break; }
    if (!key) { r.status = 'error'; r.why = 'キーが出ない: ' + JSON.stringify(await page.evaluate(async (u) => { const res = await fetch(u, { method: 'HEAD', cache: 'no-cache' }); return { sp: window.__startPano, s: res.status, e: res.headers.get('etag'), l: res.headers.get('content-length'), href: location.href.slice(0, 60) }; }, s.scene).catch((e) => String(e))) + (errors[0] ? ' ' + errors[0] : ''); return r; }
    r.key = key;
    const hasStart = !LOCAL && !!await r2Head(`pano/${key}.json`);
    const oldPoints = POINTS && !LOCAL && await r2Head(`pano/${key}.points.json`) ? await r2Json(`pano/${key}.points.json`) : null;
    // AI の判定が無い地点（2026-11-20 より前に作ったもの）は作り直す対象
    const hasPoints = !POINTS || (!!oldPoints && !REDO && (!AI || !!oldPoints.review));
    if (hasStart && hasPoints) { r.status = 'ok'; if (oldPoints?.review) r.review = { complete: oldPoints.review.complete, summary: oldPoints.review.summary }; return r; }
    r.status = !hasStart ? 'missing' : oldPoints && !oldPoints.review && AI ? 'missing-review' : oldPoints ? 'redo-points' : 'missing-points';
    if (!FIX) return r;
    // シーンが出て、ビューアーが開始位置を置き終えるまで待つ
    const t1 = Date.now(); while (Date.now() - t1 < 120000 && (await page.evaluate(() => window.__pb.n()).catch(() => -1)) <= 0) await page.waitForTimeout(500);
    await page.waitForTimeout(3000);
    let pose = await page.evaluate(() => window.__pb.pose());
    if (hasStart) {
      // 開始位置の画像は既にある: その位置・向きから地点を選ぶ（画像とツアーの起点をそろえる）
      const m = await (await fetch(`${ORIGIN}/api/pano/${key}.json`)).json();
      pose = { x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw, pitch: Number.isFinite(m.pitch) ? m.pitch : 0 };
    }
    if (![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) { r.status = 'error'; r.why = '開始位置が取れない'; return r; }
    await page.evaluate(() => window.__pb.budget(8000000));
    // 画面の飾り（ボタン・色味の重ね・案内）を消し、3D のキャンバスだけを撮る（色味の重ねはビューアーが画像の上にも同じく重ねる）
    await page.addStyleTag({ content: 'body>*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
    const dir = path.join(OUT, key.slice(0, 16)); fs.mkdirSync(dir, { recursive: true });
    const uploads = []; let metaBody = null, pointsBody = null;
    let startCaptured = null;
    if (!hasStart) {
      const faces = startCaptured = await capture(page, pose, pose.yaw, 0, r, '');
      for (const [k, b] of Object.entries(faces)) { fs.writeFileSync(path.join(dir, `${k}.jpg`), b); uploads.push([`pano/${key}-${k}.jpg`, b]); }
      const meta = { v: 1, pos: { x: pose.x, y: pose.y, z: pose.z }, yaw: pose.yaw, pitch: pose.pitch, size: SIZE, bakedAt: r.at, scene: s.scene,
        faces: Object.fromEntries(Object.entries(faces).map(([k, b]) => [k, sha(b)])) };
      metaBody = Buffer.from(JSON.stringify(meta));
      fs.writeFileSync(path.join(dir, 'meta.json'), metaBody);
    }
    if (!hasPoints) {
      // 床の当たり判定ができるまで待つ（事前に作った判定があればすぐ）
      const t2 = Date.now(); while (Date.now() - t2 < 180000 && !(await page.evaluate(() => window.__pb.walk()).catch(() => false))) await page.waitForTimeout(1000);
      // 開始位置の写りのはっきりさ（AI が使えない時の地点の良し悪しの基準）
      let startFaces = startCaptured;
      if (!startFaces) { startFaces = {}; for (const k of ['f', 'r', 'b', 'l']) startFaces[k] = Buffer.from(await (await fetch(`${ORIGIN}/api/pano/${key}-${k}.jpg`)).arrayBuffer()); }
      const base = await sharpness(startFaces);
      // 候補を選ぶ（部屋の中ほど・見通しの良い所を優先、向きは一番ひらけた方向。scripts/tour-ai.mjs の PAGE_CANDS）。
      // 撮ったあとに選び直さないのは、遠くを撮ると開始位置の周りの床の当たり判定が外れ、選び直せなくなるため（会議室で確認）。升の一覧もここで取っておく
      let pick = null;
      for (let t = 0; t < 30 && !(pick && pick.points); t++) {
        if (await page.evaluate(() => window.__pb.walk()).catch(() => false)) pick = await page.evaluate((o) => window.__pbCands(o), { pos: { x: pose.x, y: pose.y, z: pose.z } });
        if (!(pick && pick.points)) await page.waitForTimeout(1000);
      }
      const rdir = path.join(dir, 'review'); fs.rmSync(rdir, { recursive: true, force: true }); fs.mkdirSync(rdir, { recursive: true });
      await strip(startFaces, 'S', path.join(rdir, 'S.jpg'));
      const shot = [];   // { p, faces, score }
      const shoot = async (p) => {
        const faces = await capture(page, p.pos, p.yaw, 0, r, p.id + ':');
        shot.push({ p, faces, score: await sharpness(faces) / base });
        await strip(faces, p.id, path.join(rdir, p.id + '.jpg'));
      };
      for (const p of pick?.points || []) await shoot(p);
      const startNode = { pos: { x: pose.x, y: pose.y, z: pose.z }, yaw: pose.yaw };
      const nodes = () => Object.fromEntries([['S', startNode], ...shot.map((x) => [x.p.id, x.p])]);
      let ai = null; const aiRounds = [];
      if (AI && shot.length) {
        await drawMap(pick.cells, startNode.pos, shot.map((x) => x.p), path.join(rdir, 'map.png'));
        ai = aiReview(rdir, shot.map((x) => x.p.id), { engine: AI_ENGINE, model: AI_MODEL, area: pick.area });
        aiRounds.push(ai);
        // 足りない場所を撮り足して、もう一度だけ判定する
        if (!ai.error && ai.gaps?.length) {
          const add = gapPositions(ai.gaps, nodes(), pick.cells, pick.eye, pick.area);
          let k = shot.length;
          for (const g of add) { g.id = 'c' + (++k); await shoot(g); }
          if (add.length) {
            await drawMap(pick.cells, startNode.pos, shot.map((x) => x.p), path.join(rdir, 'map.png'));
            const prev = JSON.stringify({ keep: ai.points.filter((p) => p.keep).map((p) => p.id), gaps: ai.gaps, summary: ai.summary });
            const ai2 = aiReview(rdir, shot.map((x) => x.p.id), { engine: AI_ENGINE, model: AI_MODEL, round: 2, prev, area: pick.area });
            aiRounds.push(ai2);
            if (!ai2.error) ai = ai2;
          }
        }
        fs.writeFileSync(path.join(rdir, 'ai.json'), JSON.stringify(aiRounds, null, 1));
      }
      // 使う地点: AI が keep（3 点以上）にしたもの。AI が使えない時は写りのはっきりさで外す（以前と同じ基準）。
      // そのうえで開始位置から見通しをたどって行ける所だけ残す（撮り足した地点は、足りないと言われた元の地点ともつなぐ）
      const aiOk = !!ai && !ai.error;
      const verdict = Object.fromEntries((aiOk ? ai.points : []).map((p) => [String(p.id), p]));
      const good = (x) => aiOk ? !!(verdict[x.p.id]?.keep && (Number(verdict[x.p.id]?.score) || 3) >= 3) : x.score >= SHARP_MIN;
      const idx = Object.fromEntries([['S', 0], ...shot.map((x, i) => [x.p.id, i + 1])]);
      const fromOf = (i) => (i > 0 && shot[i - 1].p.from != null ? idx[shot[i - 1].p.from] : undefined);
      const link = (i, j) => !!(pick.vis[i] && pick.vis[i][j]) || fromOf(i) === j || fromOf(j) === i;
      const keep = new Set([0]);
      for (let grew = true; grew;) { grew = false; for (let i = 1; i <= shot.length; i++) if (!keep.has(i) && good(shot[i - 1]) && [...keep].some((j) => link(i, j))) { keep.add(i); grew = true; } }
      // AI が配置図と画像を見て採用したものはつながりで落とさない（広い屋外では候補どうしが 10m 以上離れ、見通しだけだと渋谷SQ で 13→0 になった。2026-11-21）
      if (aiOk) for (let i = 1; i <= shot.length; i++) if (good(shot[i - 1])) keep.add(i);
      let kept = shot.filter((_, i) => keep.has(i + 1));
      if (aiOk && Array.isArray(ai.order)) { const o = ai.order.map(String); kept.sort((a, b) => ((o.indexOf(a.p.id) + 1) || 99) - ((o.indexOf(b.p.id) + 1) || 99)); }
      kept = kept.slice(0, limits(pick?.area).keep);   // 広さに見合う数まで（25㎡ に 1 か所、4〜24）
      // 画像の名前は上書きしない（1 年キャッシュ）: 作り直しのときは、まだ使っていない番号から振る
      let n0 = 0;
      if (!LOCAL && oldPoints) for (let t = 1; t <= 99; t++) if (await r2Head(`pano/${key}-p${t}-f.jpg`)) n0 = t;
      if (n0 + kept.length > 99) { r.status = 'error'; r.why = '地点の番号が 99 を超える（作り直しすぎ）'; return r; }
      const pts = kept.map((x, i) => ({ id: 'p' + (n0 + i + 1), pos: x.p.pos, yaw: x.p.yaw, floorY: x.p.floorY, sharp: +x.score.toFixed(2), cand: x.p.id,
        ...(verdict[x.p.id] ? { ai: Number(verdict[x.p.id].score) || null } : {}) }));
      r.pick = { n: pts.length, shots: shot.length, area: pick?.area, why: pick?.why, error: pick?.error, ai: aiOk ? (ai.complete ? '揃った' : '不足あり') : (AI ? 'エラー' : 'なし') };
      const shas = {};
      for (const [i, p] of pts.entries()) {
        const sh = kept[i];
        for (const [k, b] of Object.entries(sh.faces)) { fs.writeFileSync(path.join(dir, `${p.id}-${k}.jpg`), b); uploads.push([`pano/${key}-${p.id}-${k}.jpg`, b]); }
        shas[p.id] = Object.fromEntries(Object.entries(sh.faces).map(([k, b]) => [k, sha(b)]));
      }
      const at = new Date().toISOString();
      const reviewRec = aiOk
        ? { by: ai.by, at, rounds: aiRounds.length, complete: !!ai.complete, summary: String(ai.summary || '').slice(0, 300),
            gaps: (ai.gaps || []).slice(0, 6), rejected: ai.points.filter((p) => !p.keep).map((p) => ({ id: p.id, reason: String(p.reason || '').slice(0, 80) })) }
        : null;
      if (AI && !aiOk) r.why = 'AI: ' + String(ai?.error || '候補なし').slice(0, 200);
      pointsBody = Buffer.from(JSON.stringify({ v: 1, points: pts, start: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }, eye: pick?.eye, size: SIZE, bakedAt: r.at, scene: s.scene, faces: shas,
        ...(reviewRec ? { review: reviewRec } : {}) }));
      fs.writeFileSync(path.join(dir, 'points.json'), pointsBody);
      if (reviewRec) r.review = { complete: reviewRec.complete, summary: reviewRec.summary };
      // AI が使えなかった時は R2 を書き換えない（次の実行でやり直す）。新しく作る時だけ以前の基準で置く
      if (AI && !aiOk && oldPoints) { pointsBody = null; uploads.length = uploads.length - pts.length * 6; r.status = 'error'; }
    }
    if (LOCAL) { r.status = 'local'; r.dir = dir; return r; }
    for (const [k, b] of uploads) if (!await r2Head(k)) await r2PutNew(k, b, 'image/jpeg');
    if (metaBody) await r2PutNew(`pano/${key}.json`, metaBody, 'application/json');   // 最後に置く（これがあれば使われる）
    if (pointsBody && pointsBody.length) {
      if (oldPoints) {
        // 置き換え: 今の points.json は控えとして残す（/api/pano は出さない名前）。ビューアーは points.json を no-cache で取るので、すぐ新しい方になる
        await r2PutNew(`pano/${key}.points.bak-${Date.now()}.json`, Buffer.from(JSON.stringify(oldPoints)), 'application/json');
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `pano/${key}.points.json`, Body: pointsBody, ContentType: 'application/json', Metadata: { sha256: sha(pointsBody) } }));
      } else await r2PutNew(`pano/${key}.points.json`, pointsBody, 'application/json');
    }
    r.bytes = uploads.reduce((a, [, b]) => a + b.length, 0) + (metaBody?.length || 0) + (pointsBody?.length || 0);
    r.status = r.status === 'error' ? 'error' : 'fixed';
    return r;
  } catch (e) { r.status = 'error'; r.why = String(e?.message || e).slice(0, 200); return r; }
  finally { await ctx.close(); }
}

const scenes = (await listScenes()).slice(0, LIMIT);
console.log(`対象 ${scenes.length} シーン${FIX ? '（無いものを作る）' : '（一覧のみ）'}`);
const browser = await chromium.launch({ channel: 'chrome', headless: false,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const results = [];
for (const s of scenes) {
  const r = await bake(browser, s);
  results.push(r);
  fs.appendFileSync(path.join(OUT, 'runs.jsonl'), JSON.stringify(r) + '\n');
  const color = ['ok', 'fixed', 'local'].includes(r.status) ? C.green : r.status.startsWith('missing') ? C.yellow : C.red;
  console.log(color(`[${r.status}] ${s.property || ''} ${s.scene.split('/').pop()}${r.key ? ' ' + r.key.slice(0, 12) : ''}${r.pick ? ' 地点' + r.pick.n + '/' + r.pick.shots + ' 床' + r.pick.area + '㎡ AI:' + r.pick.ai + (r.pick.error ? '(' + r.pick.error + ')' : '') : ''}${r.review?.summary ? ' 「' + r.review.summary + '」' : ''}${r.slow ? ' 遅い面:' + r.slow : ''}${r.why ? ' — ' + r.why : ''}`));
}
await browser.close();
const bad = results.filter((r) => !['ok', 'fixed', 'local'].includes(r.status) && !(r.status.startsWith('missing') && !FIX));
process.exit(bad.length ? 1 : 0);
