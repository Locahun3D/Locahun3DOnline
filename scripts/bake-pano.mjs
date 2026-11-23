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
import { routeLocalZips } from './local-zip-route.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { PAGE_GRAPH, largestComponent, removeFurniture, buildGraph, voronoi, nodeInfo, levels, drawGraph, alternatives, relinkByDistance } from './tour-graph.mjs';
import { PAGE_CANDS, strip, map as drawMap, review as aiReview, reviewNodes, gapPositions, limits } from './tour-ai.mjs';

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
const REDO = flag('--redo-points');
// 本人が置いた地点（2026-11-23 本人「理想はこれ」「歩く導線と、座席や見たい箇所からみれるように」）: tour-marks-read.py の <name>_marks.json。
// 位置はそのまま使い（形の検査・AI で外さない）、床の高さはその場の 0.7m 以内のいちばん低い面（座席の点はそばの床、段上の席は段の面）
let MANUAL = arg('--manual') ? JSON.parse(fs.readFileSync(arg('--manual'), 'utf8')).points : null;   // 地点を選び直す（今の points.json は R2 に控えを残して置き換える）
// 詰めた自動配置（2026-11-23 本人 A 案: TK の理想＝歩く導線に 1.2〜1.5m おき＋座席・カウンター・見たい所）: 床に 1.4m おき（広い所は最大 300 か所に収まるよう広げる）
// ＋外した家具の塊（座面・テーブル・カウンター）にも 1.4m おきに置き、本人の点と同じ流れ（すき間探し・AI で控えへ）で撮る。控えでも直らない点は外す
const DENSE = flag('--dense');
const AI_MODEL = arg('--ai-model', '');   // 空なら Claude は fable、Codex は gpt-6-astra
const AI_ENGINE = arg('--ai-engine', 'auto');   // auto = Claude Code → だめなら Codex
const RESHOOT = flag('--reshoot');   // 画像だけ今の画質で撮り直す（地点・判定はそのまま。reshoot() 参照）
const LOCAL = flag('--local');
const GRAPH = flag('--graph');   // 動線グラフ方式の地点（scripts/tour-graph.mjs。<key>.graph.json）。2026-11-21〜
const PROBE = flag('--probe');   // --graph で、地点の配置図だけ作って撮らない（確かめ用）   // R2 に書かず artifacts/pano/ にだけ作る（試し撮り・見比べ用）
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const SIZE = Number(arg('--size', 1536));   // 2026-11-21 本人「360°画像、荒いところあるかも」: 1024 → 1536、2 倍で描いて縮める
const QUALITY = Number(arg('--quality', 82));
const SS = Number(arg('--ss', 2));   // 何倍で描いてから縮めるか（2 = 2 倍の解像度で描いて SIZE に縮める。輪郭のギザギザ・ざらつきが減る）
const OUT = path.resolve(ROOT, arg('--out', 'artifacts/pano'));
const ZIPDIR = arg('--zipdir', '');   // 登録前のシーンを手元の ZIP で（--local と一緒に）
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
// 送受信の一時的な失敗（SSL の bad record mac・接続切れ・5xx）は待って送り直す。320 地点を撮り終えた後の
// 送信 1 回の失敗で 3 時間分が消えた（2026-11-23 秋葉原）
async function r2Retry(fn) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const st = e?.$metadata?.httpStatusCode;
      const transient = !st || st >= 500 || /ssl|ECONNRESET|ETIMEDOUT|EPIPE|socket|network|bad record mac/i.test(String(e?.message || e));
      if (!transient || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}
async function r2Head(k) { return r2Retry(() => r2Head0(k)); }
async function r2Head0(k) {
  try { return await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: k })); }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null; throw e; }
}
async function r2Json(k) {
  return r2Retry(async () => { const o = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: k })); return JSON.parse(await o.Body.transformToString()); });
}
async function r2PutNew(k, body, type) {
  // 追加のみ: If-None-Match: * で既存キーへの上書きを R2 側でも拒否させる。
  try { await r2Retry(() => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: body, ContentType: type, Metadata: { sha256: sha(body) }, IfNoneMatch: '*' }))); }
  catch (e) {
    // 送れていたのに応答が遅れて SDK が送り直すと 412 になる（2026-11-22 TK MainHD・zigsaw）。中身が同じなら成功
    if (e?.$metadata?.httpStatusCode !== 412) throw e;
    const h = await r2Head(k);
    if (h?.Metadata?.sha256 !== sha(body)) throw new Error(`既にある別の中身: ${k}`);
  }
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
  viewerHtml = html.replace(ANCHOR, ANCHOR + HOOK + PAGE_CANDS + PAGE_GRAPH);
  return viewerHtml;
}

async function openScene(browser, scene) {
  const ctx = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: SS });
  const page = await ctx.newPage();
  // 広い屋外（秋葉原 Fusion など、事前作成の当たり判定を配れないシーン）は、ブラウザ用の上限（200万升）で開始位置の床まで作れない。
  // 撮るときは collision-check と同じく 2,000万升まで作らせる（PC の GPU・メモリで作る。2026-11-23）
  if (DENSE) await page.addInitScript(() => { window.__l3dBakeMaxCells = 20000000; });
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
  await routeLocalZips(page, ZIPDIR);   // --zipdir: 登録前の手元の ZIP（/api/viewer-stream/local/<名前>.zip）
  await page.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/api/pano/'), (route) => route.fulfill({ status: 404, headers: { 'cache-control': 'no-store' }, body: '' }));
  await page.goto(`${ORIGIN}/viewer/offline-viewer.html?autoload=${encodeURIComponent(scene)}&protected=1`, { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
}

// 3D が落ち着く（点数が変わらず取得も止まる）まで待つ
async function settle(page, maxMs, iv = 700) {
  const t0 = Date.now(); let last = -2, same = 0;
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(iv);
    const s = await page.evaluate(() => ({ n: window.__pb.n(), busy: window.__pb.busy() })).catch(() => null);
    if (s && s.n > 0 && s.n === last && s.busy === 0) { if (++same >= (iv < 700 ? 2 : 3)) return true; } else same = 0;
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
async function capture(page, pos, yaw0, pitch0, r, tag, iv = 700) {
  const faces = {};
  for (const [k, [dy, p]] of Object.entries(FACES)) {
    await page.evaluate(([pos, yw, pt]) => window.__pb.aim(pos, yw, pt), [pos, yaw0 + dy, p + (k === 'u' || k === 'd' ? 0 : pitch0)]);
    const t0 = Date.now();
    const ok = await settle(page, 90000, iv);
    if (!ok) r.slow = (r.slow || '') + tag + k + ' ';
    await page.waitForTimeout(iv < 700 ? 150 : 400);
    const t1 = Date.now();
    // 2 倍で描いた画面は PNG だと取り込みが遅い（3072px で 1 枚 1 秒以上）。高画質の JPEG で取り込んでから縮める（縮めるので差は見えない）
    if (SS > 1) { const png = await page.locator('canvas').first().screenshot(iv < 700 ? { type: 'jpeg', quality: 95 } : { type: 'png' }); faces[k] = await sharp(png).resize(SIZE, SIZE, { kernel: 'lanczos3' }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer(); }
    else faces[k] = await page.locator('canvas').first().screenshot({ type: 'jpeg', quality: QUALITY });
    r.tSettle = (r.tSettle || 0) + (t1 - t0); r.tShot = (r.tShot || 0) + (Date.now() - t1);
  }
  return faces;
}

// ── 動線グラフ方式の地点（--graph、scripts/tour-graph.mjs の説明を参照）──
// 画像の名前は <key>-g<set>-n<番号>-<面>.jpg（1536px）と <面>.s.jpg（640px、遅い回線・弱い端末の軽量表示用）。set は撮るたびに変える（1 年キャッシュ）。
// 結果は <key>.graph.json（v:2）。古い points.json は残す（今のビューアーはそちらを読む。新しいビューアーは graph.json を先に読む）
const GRAPH_SMALL = 640;
async function graphPoints(page, pose, key, dir, r, uploads) {
  const t2 = Date.now(); while (Date.now() - t2 < 180000 && !(await page.evaluate(() => window.__pb.walk()).catch(() => false))) await page.waitForTimeout(1000);
  // 開始位置の床と目の高さ（PAGE_CANDS の床の探し方を使う。周り 3m だけ）
  let base = null;
  for (let t = 0; t < 60 && !(base && base.floor0 != null); t++) {   // 当たり判定の読み込みが遅いシーンがある（TK Entrance）。後半は探す範囲を広げる
    if (await page.evaluate(() => window.__pb.walk()).catch(() => false)) base = await page.evaluate((o) => window.__pbCands(o), { pos: { x: pose.x, y: pose.y, z: pose.z }, radius: t < 30 ? 3 : 6, max: 1 });
    if (!(base && base.floor0 != null)) await page.waitForTimeout(1000);
  }
  // 予備（2026-11-23 秋葉原 Fusion: 床の候補探しが 0 件）: 開始位置の真下を直接探す。高さの違う 3 つの所から下へ
  if (DENSE && !(base && base.floor0 != null)) for (const up of [0.5, 2, 6]) {
    const f = (await page.evaluate((o) => window.__pbFloorProbe(o), { L: 40, pts: [{ x: pose.x, y: pose.y + up, z: pose.z }] }).catch(() => [null]))[0];
    console.log('start floor probe', up, f, JSON.stringify(pose));
    if (f !== null && pose.y - f > 0.3 && pose.y - f < 30) { base = { floor0: f, eye: Math.min(1.7, Math.max(1.1, pose.y - f)) }; break; }
  }
  if (!base || base.floor0 == null) { r.status = 'error'; r.why = '動線: 開始位置の床が見つからない ' + String(base?.error || ''); return null; }
  const g = await page.evaluate((o) => window.__pbGraph(o), { pos: { x: pose.x, y: pose.y, z: pose.z }, floor0: base.floor0, eye: base.eye });
  if (g.error) { r.status = 'error'; r.why = '動線: ' + g.error; return null; }
  if (flag('--diag')) {
    const d = await page.evaluate((o) => window.__pbDiag(o), { x: pose.x, y: pose.y, z: pose.z });
    console.log('normals', JSON.stringify(await page.evaluate((o) => window.__pbNormals(o), { x: pose.x, y: pose.y, z: pose.z })));
    console.log('floor heights (dm) around start, y=' + pose.y.toFixed(2) + ' floor0=' + base.floor0 + String.fromCharCode(10) + d);
  }
  if (PROBE) { fs.mkdirSync(path.join(dir, "graph"), { recursive: true }); fs.writeFileSync(path.join(dir, "raw-cells.json"), JSON.stringify({ cells: g.cells, adj: g.adj })); }
  const rawCells = g.cells;
  { const fu = removeFurniture(g.cells, g.adj); g.furniture = fu.removed; g.furnitureGroups = fu.groups; g.cells = fu.cells; g.adj = fu.adj;   // 家具の上（座面・テーブル）を外してから
    const lc = largestComponent(g.cells, g.adj, { x: pose.x, z: pose.z, floor: base.floor0 }); g.rawCells = g.cells.length; g.parts = lc.parts; g.cells = lc.cells; g.adj = lc.adj; g.seed = lc.seed; }
  const built = buildGraph(g.cells, g.adj, DENSE ? { seed: g.seed, eye: g.eye, spacing: Math.max(1.4, Math.min(4, Math.sqrt(g.cells.length * 0.25 / (300 * 0.55)))), maxNodes: 320 } : { seed: g.seed, eye: g.eye });
  if (DENSE) {
    const pts = built.nodeCells.map((c) => ({ x: g.cells[c][0], z: g.cells[c][1] }));
    const S = built.S; let seats = 0;
    for (const grp of g.furnitureGroups || []) {
      const area = grp.length * 0.25, ups = grp.map((c) => c[3]).sort((a, b) => a - b), mu = ups[ups.length >> 1];
      if (area < 0.5 || mu < 0.3 || mu > 1.3) continue;   // 小さすぎる物・棚より高い物は外す（座面 0.4・テーブル 0.7・カウンター 1.0 前後）
      const cx = grp.reduce((a, c) => a + c[0], 0) / grp.length, cz = grp.reduce((a, c) => a + c[1], 0) / grp.length;
      const order = grp.slice().sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
      for (const c of order) if (pts.every((q) => Math.hypot(q.x - c[0], q.z - c[1]) >= Math.min(S, 1.4) * 0.8)) { pts.push({ x: c[0], z: c[1], seat: true }); seats++; }
    }
    // 床の塗り広げが届かない見どころ（舞台・段上の席・ブース・DJ ブース前など）: 地点の範囲の 1.4m 方眼で、真下に面があり、
    // 床の高さが近くの地点の -1〜+1.5m、目の高さから近くの地点（6m 以内）が見通せる所に置く（壁の外・空中のごみには置かない）
    let extra = 0;
    // 波のように広げる（2026-11-23: 床の塗り広げが 1〜4 升しか届かないシーンで地点が 3 か所になった）: 今ある点から 6m 以内の方眼の点を調べ、
    // 受け入れた点から次の波を調べる。最大 14 波・合計 320 か所まで
    { const step = Math.max(1.4, S), acc = built.nodeCells.map((c) => ({ x: g.cells[c][0], z: g.cells[c][1], f: g.cells[c][2] }));
      for (const q of pts) if (!acc.some((a) => Math.hypot(a.x - q.x, a.z - q.z) < 0.1)) { const n = acc.reduce((b, a) => Math.hypot(a.x - q.x, a.z - q.z) < Math.hypot(b.x - q.x, b.z - q.z) ? a : b); acc.push({ x: q.x, z: q.z, f: n.f }); }
      const gx = (v) => Math.round(v / step) * step, tried = new Set();
      for (let wave = 0; wave < 14 && pts.length < 320; wave++) {
        const cand = [];
        for (const a of acc) for (let dx = -6; dx <= 6; dx += step) for (let dz = -6; dz <= 6; dz += step) {
          const x = +gx(a.x + dx).toFixed(2), z = +gx(a.z + dz).toFixed(2), k = x + ',' + z;
          if (tried.has(k)) continue; tried.add(k);
          if (pts.some((q) => Math.hypot(q.x - x, q.z - z) < step * 0.8)) continue;
          const ref = acc.reduce((b, c) => Math.hypot(c.x - x, c.z - z) < Math.hypot(b.x - x, b.z - z) ? c : b);
          if (Math.hypot(ref.x - x, ref.z - z) > 6) continue;
          cand.push({ x, z, y0: ref.f + 2.6, ref });
        }
        if (!cand.length) break;
        const fl = await page.evaluate((o) => window.__pbFloorProbe(o), { pts: cand.map((c) => ({ x: c.x, y: c.y0, z: c.z })) });
        const ok = cand.map((c, i) => ({ ...c, f: fl[i] })).filter((c) => c.f !== null && c.f - c.ref.f > -1 && c.f - c.ref.f < 1.5);
        if (!ok.length) break;
        const P = [...acc.map((c) => ({ x: c.x, y: c.f + 1.4, z: c.z })), ...ok.map((c) => ({ x: c.x, y: c.f + 1.4, z: c.z }))], N0 = acc.length, pairs = [];
        ok.forEach((c, i) => { acc.map((q, j) => [Math.hypot(q.x - c.x, q.z - c.z), j]).filter(([d]) => d <= 6).sort((u, v) => u[0] - v[0]).slice(0, 3).forEach(([, j]) => pairs.push([N0 + i, j])); });
        const seen = new Set((pairs.length ? await page.evaluate((o) => window.__pbLos(o), { pairs, pts: P }) : []).map(([i]) => i - N0));
        let add = 0;
        for (const [i, c] of ok.entries()) if (seen.has(i) && pts.length < 320 && pts.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= step * 0.8)) { pts.push({ x: c.x, z: c.z, floorY: c.f, view: true }); acc.push({ x: c.x, z: c.z, f: c.f }); extra++; add++; }
        if (!add) break;
      }
    }
    MANUAL = pts.map((q, i) => ({ id: (q.seat ? 's' : q.view ? 'v' : 'r') + (i + 1), x: +q.x.toFixed(2), z: +q.z.toFixed(2), ...(q.floorY != null ? { floorY: q.floorY } : {}) }));
    r.dense = { S: +S.toFixed(2), route: built.nodeCells.length, seats, extra };
    console.log('dense', JSON.stringify(r.dense));
  }
  let nodes = nodeInfo(g.cells, g.adj, built.nodeCells, g.eye, built.clr);
  if (MANUAL) nodes = MANUAL.map((m) => {
    let bi = 0, bd = Infinity; g.cells.forEach((c, i) => { const d = Math.hypot(c[0] - m.x, c[1] - m.z); if (d < bd) { bd = d; bi = i; } });
    const near = rawCells.filter((c) => Math.hypot(c[0] - m.x, c[1] - m.z) <= 0.7).map((c) => c[2]);
    const f = Number.isFinite(m.floorY) ? m.floorY : near.length ? Math.min(...near) : g.cells[bi][2];
    const info = nodeInfo(g.cells, g.adj, [built.nodeCells[0], bi], g.eye, built.clr)[1];
    return { ...info, pos: { x: m.x, y: f + g.eye, z: m.z }, floorY: f, manual: m.id, snap: +bd.toFixed(2) };
  });
  nodes.forEach((p, i) => { p.id = 'n' + (i + 1); });
  // 本人が置いた地点: カメラがテーブル・背もたれ・仕切りにめり込まない場所を、その場から少しずつずらして探す（2026-11-23 TK MainHD の座席で n29/n30/n38 がめり込んだ）。
  // 条件: 目の高さの周り 0.3m に物が無い・真下の面から 0.55m 以上（テーブルの真上に目を置かない）・頭の上 0.15m 以上。近い順・低い順で最初に満たすもの
  if (MANUAL) {
    const offs = [[0, 0]]; for (const r of [0.25, 0.5, 0.75]) for (let k = 0; k < 8; k++) offs.push([r * Math.sin(k * Math.PI / 4), r * Math.cos(k * Math.PI / 4)]);
    const hs = [1.15, 1.3, 1.45, 1.6, 1.75];
    for (const p of nodes) {
      const cand = []; for (const [dx, dz] of offs) for (const h of hs) cand.push({ x: p.pos.x + dx, y: p.floorY + h, z: p.pos.z + dz, floorY: p.floorY });
      const res = await page.evaluate((o) => window.__pbClear(o), { pts: cand });
      const j = res.findIndex((c) => c.minC >= 0.3 && c.down >= 0.55 && c.down < 2.5 && c.up >= 0.15);
      const k = j >= 0 ? j : res.reduce((b, c, i) => (c.minC > res[b].minC ? i : b), 0);
      const q = cand[k]; p.clear = { ...res[k], moved: +Math.hypot(q.x - p.pos.x, q.z - p.pos.z).toFixed(2), ok: j >= 0 };
      // 写りが悪かったときの控え: 条件を満たす別の場所（0.3m 以上離れたもの、場所ごとに一番低い高さ）
      const seen = new Set(); p.alts = [];
      res.forEach((c, i) => { const a = cand[i], kk = a.x.toFixed(2) + ',' + a.z.toFixed(2);
        if (c.minC >= 0.3 && c.down >= 0.55 && c.down < 2.5 && c.up >= 0.15 && !seen.has(kk) && Math.hypot(a.x - q.x, a.z - q.z) >= 0.3) { seen.add(kk); p.alts.push({ pos: { x: a.x, y: a.y, z: a.z }, floorY: a.y - Math.min(c.down, 2) }); } });
      p.pos = { x: q.x, y: q.y, z: q.z }; p.floorY = q.y - Math.min(res[k].down, 2);
    }
    r.manualClear = { ok: nodes.filter((p) => p.clear.ok).length, moved: nodes.filter((p) => p.clear.moved > 0).length, total: nodes.length, bad: nodes.filter((p) => !p.clear.ok).map((p) => p.id) };
    console.log('manual clear', JSON.stringify(r.manualClear));
    if (DENSE) { nodes = nodes.filter((p) => p.clear.ok); nodes.forEach((p, i) => { p.id = 'n' + (i + 1); }); }   // 自動の点: すき間が無い所には置かない
  }
  const rdir = path.join(dir, 'graph'); fs.rmSync(rdir, { recursive: true, force: true }); fs.mkdirSync(rdir, { recursive: true });
  // 形の検査（撮る前。2026-11-21 本人「空中やめり込んでるところを除外」）: めり込み（目の高さの周りが塞がる）・空中（斜め下に地面が見えない）
  // の地点は、近くの良い升へ移す。移せなければ置かない（升の割り当て直しで残りはつながったまま）
  const shapeOk = (c) => c && c.tight < 3 && c.air < 4 && c.near < 4;   // near: 0.6m 以内に柱・壁が 4 方向以上（AI に柱が近すぎると外された 11-22）
  const check = (list) => list.length ? page.evaluate((o) => window.__pbNodeCheck(o), { pts: list.map((p) => ({ ...p.pos, floorY: p.floorY })) }) : [];
  const relocate = async (p, ok) => {
    const taken = nodes.filter((q) => q !== p && !q.gone).map((q) => ({ x: q.pos.x, y: q.floorY, z: q.pos.z }));
    const alts = nodeInfo(g.cells, g.adj, alternatives(g.cells, g.adj, built.clr, p.cell, taken).slice(0, 10), g.eye, built.clr);
    const ch = await check(alts);
    for (let k = 0; k < alts.length; k++) if (shapeOk(ch[k]) && (!ok || ok(alts[k]))) return { ...alts[k], check: ch[k] };
    return null;
  };
  const geo = { moved: [], removed: [] };
  { const ch = await check(nodes); nodes.forEach((p, i) => { p.check = ch[i]; }); }
  for (const p of nodes) if (!MANUAL && !shapeOk(p.check)) {
    const alt = await relocate(p);
    if (alt) { Object.assign(p, { cell: alt.cell, pos: alt.pos, floorY: alt.floorY, clr: alt.clr, stair: alt.stair, check: alt.check }); geo.moved.push(p.id); }
    else { p.gone = true; geo.removed.push(p.id); }
  }
  nodes = nodes.filter((p) => !p.gone);
  let vor = voronoi(g.cells, g.adj, nodes.map((p) => p.cell));
  r.graph = { cells: g.cells.length, area: Math.round(built.area), S: +built.S.toFixed(2), nodes: nodes.length, edges: vor.edges.length, geoMoved: geo.moved.length, geoRemoved: geo.removed.length,
    levels: levels(g.cells), stair: nodes.filter((p) => p.stair).length, why: g.why, floors: g.floors, parts: g.parts, furniture: g.furniture, rawCells: g.rawCells, floor0: base.floor0, eye: base.eye, ms: g.ms, timeout: g.timeout, capped: g.capped };
  await drawGraph(g.cells, nodes, vor.edges, path.join(rdir, 'map.png'), { start: pose });
  fs.writeFileSync(path.join(rdir, 'graph-probe.json'), JSON.stringify({ ...r.graph, geo, nodes: nodes.map(({ cell, ...p }) => p), edges: vor.edges }));
  if (PROBE) return null;
  const set = crypto.randomBytes(3).toString('hex');
  const shots = {};
  const tc = Date.now();
  const shoot = async (p) => { const faces = await capture(page, p.pos, p.yaw, 0, r, p.id + ':', 250); shots[p.id] = faces; await strip(faces, p.id, path.join(rdir, p.id + '.jpg'), { down: true }); };
  for (const p of nodes) await shoot(p);
  // 本人が置いた地点: 写りの悪いもの（めり込み・崩れ・壁が近すぎる）を AI に選ばせ、その地点だけ 0.75m 以内の控えの場所で撮り直す（最大 3 か所）。
  // 良くなったものだけ差し替える（地点そのものは外さない。2026-11-23 TK MainHD の n5/n13/n55/n57-59/n63）
  if (MANUAL && AI) {
    const ai0 = reviewNodes(rdir, nodes.map((p) => p.id), { engine: AI_ENGINE, model: AI_MODEL, manual: true });
    r.manualAi = { first: ai0.error ? 'error' : ai0.bad.map((b) => b.id), fixed: [], still: [] };
    if (!ai0.error) for (const b of ai0.bad) {
      const p = nodes.find((q) => q.id === b.id); if (!p) continue;
      let ok = false;
      for (const a of (p.alts || []).slice(0, 3)) {
        const t = { ...p, id: p.id + 'x', pos: a.pos, floorY: a.floorY };
        await shoot(t);
        const rv = reviewNodes(rdir, [t.id], { engine: AI_ENGINE, model: AI_MODEL, manual: true });
        if (!rv.error && !rv.bad.length) { p.pos = a.pos; p.floorY = a.floorY; shots[p.id] = shots[t.id];
          fs.copyFileSync(path.join(rdir, t.id + '.jpg'), path.join(rdir, p.id + '.jpg')); ok = true; break; }
      }
      (ok ? r.manualAi.fixed : r.manualAi.still).push(p.id);
    }
    console.log('manual ai', JSON.stringify(r.manualAi));
    if (DENSE && Array.isArray(r.manualAi.still)) { const st = new Set(r.manualAi.still); nodes = nodes.filter((p) => !st.has(p.id)); }   // 自動の点: 控えでも直らない点は外す
  }
  // AI の監視: 空中・めり込み・崩れ・人が立てない地点を外す。外した地点は近くの良い升へ移して撮り直し、もう一度だけ判定する
  let ai = null, ai2 = null, ai3 = null; const badList = [], replaced = [], rejected = [];
  if (AI && !MANUAL) {
    ai = reviewNodes(rdir, nodes.map((p) => p.id), { engine: AI_ENGINE, model: AI_MODEL });
    if (!ai.error) {
      badList.push(...ai.bad);
      const retry = []; let nextId = Math.max(0, ...nodes.map((p) => Number(p.id.slice(1)) || 0));
      for (const b of ai.bad) {
        const p = nodes.find((q) => q.id === b.id); if (!p) continue;
        const far = (a) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) >= 0.9;   // 元の場所からは離す（同じ崩れを撮らない）
        const alt = await relocate(p, far);
        if (!alt) continue;
        const q = { ...p, id: 'n' + (++nextId), cell: alt.cell, pos: alt.pos, floorY: alt.floorY, clr: alt.clr, stair: alt.stair, check: alt.check, was: p.id };
        await shoot(q); retry.push(q);
      }
      if (retry.length) {
        ai2 = reviewNodes(rdir, retry.map((q) => q.id), { engine: AI_ENGINE, model: AI_MODEL });
        const bad2 = new Set(ai2.error ? retry.map((q) => q.id) : ai2.bad.map((b) => b.id));
        for (const q of retry) if (!bad2.has(q.id)) replaced.push(q); else rejected.push(q);
        if (!ai2.error) badList.push(...ai2.bad);
      }
    }
  }
  // AI が外すと言った地点は全部外す（上限を付けると壊れた地点が残った: 4F Studio の屋上。2026-11-21）。
  // 外した割合が多いシーンは tour-audit.mjs が「スキャンの質」として出す
  const badIds = new Set((ai && !ai.error ? ai.bad : []).map((b) => b.id));
  const repl = new Map(replaced.filter((q) => badIds.has(q.was)).map((q) => [q.was, q]));
  const dropped = nodes.filter((p) => badIds.has(p.id) && !repl.has(p.id));
  let keepN = nodes.flatMap((p) => !badIds.has(p.id) ? [p] : repl.has(p.id) ? [repl.get(p.id)] : []);
  r.graph.aiReplaced = repl.size;
  // 間が空いた所を埋める（2026-11-22 TK MainHD: 通路の地点が外れて 11m 空いた → 本人「移動したくても次の点がない」）。
  // 一番遠い床の升の近くに置き直して撮り、AI がもう一度見て良いものだけ足す。外された場所（0.6m 以内）には置かない
  const filled = [], unstand = [...nodes.filter((p) => badIds.has(p.id)), ...rejected].map((p) => p.pos);   // AI が立てないと言った場所
  if (AI && ai && !ai.error) {
    const bad = [...nodes.filter((p) => badIds.has(p.id)), ...rejected].map((p) => p.pos), cand = [], tried = [];
    let nextId = Math.max(0, ...[...nodes, ...replaced, ...rejected].map((p) => Number(p.id.slice(1)) || 0));
    for (let k = 0; k < 6; k++) {
      const v = voronoi(g.cells, g.adj, [...keepN, ...cand].map((p) => p.cell));
      let far = -1, fd = built.S * 2;
      for (let i = 0; i < g.cells.length; i++) if (v.dist[i] > fd && Number.isFinite(v.dist[i]) && !tried.some((t) => Math.hypot(t[0] - g.cells[i][0], t[1] - g.cells[i][1]) < 1.5)
        && !bad.some((q) => Math.hypot(q.x - g.cells[i][0], q.z - g.cells[i][1]) < 1.2)) { fd = v.dist[i]; far = i; }
      if (far < 0) break;
      tried.push(g.cells[far]);
      const taken = [...keepN, ...cand].map((q) => ({ x: q.pos.x, y: q.floorY, z: q.pos.z }));
      const alts = nodeInfo(g.cells, g.adj, [far, ...alternatives(g.cells, g.adj, built.clr, far, taken, { min: 0, max: 1.5 })].slice(0, 12), g.eye, built.clr);
      const ch = await check(alts);
      const j = alts.findIndex((a, i) => shapeOk(ch[i]) && bad.every((b) => Math.hypot(b.x - a.pos.x, b.z - a.pos.z) >= 0.6)
        && !taken.some((t) => Math.hypot(t.x - a.pos.x, t.z - a.pos.z) < 1.2));
      if (j < 0) continue;
      const q = { ...alts[j], check: ch[j], id: 'n' + (++nextId), fill: true };
      await shoot(q); cand.push(q);
    }
    if (cand.length) {
      ai3 = reviewNodes(rdir, cand.map((q) => q.id), { engine: AI_ENGINE, model: AI_MODEL });
      const bad3 = new Set(ai3.error ? cand.map((q) => q.id) : ai3.bad.map((b) => b.id));
      for (const q of cand) if (!bad3.has(q.id)) filled.push(q); else unstand.push(q.pos);
      if (!ai3.error) badList.push(...ai3.bad);
      keepN = [...keepN, ...filled];
    }
  }
  if (AI && !MANUAL) fs.writeFileSync(path.join(rdir, 'ai.json'), JSON.stringify({ round1: ai, round2: ai2, round3: ai3 }, null, 1));
  vor = voronoi(g.cells, g.adj, keepN.map((p) => p.cell));
  // 見通し（8m 以内、つながりは別に持つ）
  const ek = new Set(vor.edges.map(([a, b]) => a + ',' + b)), pairs = [];
  for (let i = 0; i < keepN.length; i++) for (let j = i + 1; j < keepN.length; j++) {
    const a = keepN[i].pos, b = keepN[j].pos;
    if (!ek.has(i + ',' + j) && Math.hypot(a.x - b.x, a.z - b.z) <= 8 && Math.abs(a.y - b.y) < 3) pairs.push([i, j]);
  }
  let see = pairs.length ? await page.evaluate((o) => window.__pbLos(o), { pairs, pts: keepN.map((p) => p.pos) }) : [];
  if (MANUAL) { const rl = relinkByDistance(keepN.map((p) => p.pos), vor.edges, see, 3); vor = { ...vor, edges: rl.edges }; see = rl.see; }   // 座席の点は床の区画の外なので、見通せる近い点どうしでつなぐ
  // 監視の数字（tour-audit.mjs が基準と比べる）
  // 空き・届く割合は、AI が立てないと言った場所（家具の上など）の 1.2m 以内の床を除いて数える（TK MainHD のボックス席の段上）
  const standable = g.cells.map((c) => !unstand.some((b) => Math.hypot(b.x - c[0], b.z - c[1]) < 1.2));
  const fin = Array.from(vor.dist).filter((d, i) => standable[i] && Number.isFinite(d));
  const parent = keepN.map((_, i) => i), root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const [a, b] of vor.edges) parent[root(a)] = root(b);
  const audit = { cells: g.cells.length, area: Math.round(built.area), S: +built.S.toFixed(2), nodes: keepN.length, dropped: dropped.length, edges: vor.edges.length, see: see.length,
    maxGap: +Math.max(0, ...fin).toFixed(2), coverage: +(fin.filter((d) => d <= built.S * 1.25).length / Math.max(1, standable.filter(Boolean).length)).toFixed(3), unstandable: standable.filter((x) => !x).length,
    components: new Set(keepN.map((_, i) => root(i))).size, levels: levels(g.cells), stairNodes: keepN.filter((p) => p.stair).length,
    timeout: !!g.timeout, capped: !!g.capped, ai: ai ? (ai.error ? 'error' : 'ok') : 'off', geoMoved: geo.moved.length, geoRemoved: geo.removed.length, aiReplaced: repl.size, filled: filled.length };
  Object.assign(r.graph, { kept: keepN.length, dropped: dropped.length, see: see.length, maxGap: audit.maxGap, coverage: audit.coverage, ai: audit.ai });
  await drawGraph(g.cells, keepN, vor.edges, path.join(rdir, 'map-final.png'), { start: pose, dropped });
  // 動線シート（人が見て確かめる用）: 残した地点の帯（L F R B D）を 24 か所ずつ 1 枚に
  for (let k = 0; k * 24 < keepN.length; k++) {
    const part = keepN.slice(k * 24, k * 24 + 24), Wt = 800, Ht = 160;
    const tiles = await Promise.all(part.map((p) => sharp(path.join(rdir, p.id + '.jpg')).resize(Wt, Ht).toBuffer()));
    await sharp({ create: { width: Wt * 2, height: Ht * Math.ceil(part.length / 2), channels: 3, background: '#222' } })
      .composite(tiles.map((b, i) => ({ input: b, left: (i % 2) * Wt, top: Math.floor(i / 2) * Ht }))).jpeg({ quality: 72 }).toFile(path.join(rdir, `sheet-${k + 1}.jpg`));
  }
  const shas = {};
  for (const p of keepN) {
    shas[p.id] = {};
    for (const [k, b] of Object.entries(shots[p.id])) {
      const small = await sharp(b).resize(GRAPH_SMALL, GRAPH_SMALL, { kernel: 'lanczos3' }).jpeg({ quality: 74, mozjpeg: true }).toBuffer();
      uploads.push([`pano/${key}-g${set}-${p.id}-${k}.jpg`, b], [`pano/${key}-g${set}-${p.id}-${k}.s.jpg`, small]);
      if (LOCAL) { fs.writeFileSync(path.join(rdir, `${p.id}-${k}.jpg`), b); fs.writeFileSync(path.join(rdir, `${p.id}-${k}.s.jpg`), small); }
      shas[p.id][k] = sha(b).slice(0, 16);
    }
  }
  const at = new Date().toISOString();
  const body = { v: 2, set, eye: g.eye, S: audit.S, size: SIZE, small: GRAPH_SMALL, bakedAt: at, scene: r.scene,
    start: { x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw },
    nodes: keepN.map((p) => ({ id: p.id, pos: { x: +p.pos.x.toFixed(3), y: +p.pos.y.toFixed(3), z: +p.pos.z.toFixed(3) }, floorY: +p.floorY.toFixed(3), yaw: +p.yaw.toFixed(4), ...(p.stair ? { stair: true } : {}) })),
    edges: vor.edges, see, audit, faces: shas,
    ...(DENSE ? { placedBy: 'dense' } : MANUAL ? { placedBy: 'owner' } : {}),
    review: ai ? (ai.error ? { error: String(ai.error).slice(0, 300), at } : { by: ai.by, at, bad: badList, dropped: dropped.map((p) => p.id), replaced: [...repl.keys()], filled: filled.map((q) => q.id), missing: ai.missing, summary: ai.summary }) : null };
  const buf = Buffer.from(JSON.stringify(body));
  fs.writeFileSync(path.join(rdir, 'graph.json'), buf);
  return buf;
}

// 撮り直し（--reshoot、2026-11-21 本人「360°画像、荒いところあるかも」→「作り直して」）:
// 地点の位置・向き・AI の判定はそのままに、画像だけを今の画質（SIZE・SS 倍）で撮り直す。
// 画像は 1 年キャッシュなので名前を変える: 開始位置は <key>-r<N>-{面}.jpg（meta.r = N）、地点はまだ使っていない番号 p<N>。
// 置き換える meta.json・points.json は R2 に控え（.bak-<時刻>.json）を残す。済んだもの（size >= SIZE）は飛ばすので途中から再開できる
async function reshoot(page, s, key, oldPoints, r) {
  const meta = await r2Json(`pano/${key}.json`);
  const needStart = (meta.size || 1024) < SIZE;
  const needPts = !!(oldPoints && oldPoints.points?.length && (oldPoints.size || 1024) < SIZE);
  if (!needStart && !needPts) { r.status = 'ok'; r.why = '撮り直し済み'; return r; }
  r.status = 'reshoot'; r.need = { start: needStart, points: needPts ? oldPoints.points.length : 0 };
  if (!FIX) return r;
  const t1 = Date.now(); while (Date.now() - t1 < 120000 && (await page.evaluate(() => window.__pb.n()).catch(() => -1)) <= 0) await page.waitForTimeout(500);
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__pb.budget(8000000));
  await page.addStyleTag({ content: 'body>*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
  const dir = path.join(OUT, key.slice(0, 16), 'reshoot'); fs.mkdirSync(dir, { recursive: true });
  const uploads = []; let newMeta = null, newPts = null;
  if (needStart) {
    const rv = (Number(meta.r) || 1) + 1;
    const faces = await capture(page, meta.pos, meta.yaw, 0, r, 'S:');
    for (const [k, b] of Object.entries(faces)) { fs.writeFileSync(path.join(dir, `r${rv}-${k}.jpg`), b); uploads.push([`pano/${key}-r${rv}-${k}.jpg`, b]); }
    newMeta = { ...meta, r: rv, size: SIZE, bakedAt: r.at, faces: Object.fromEntries(Object.entries(faces).map(([k, b]) => [k, sha(b)])) };
  }
  if (needPts) {
    let n0 = 0; for (let t = 1; t <= 99; t++) if (await r2Head(`pano/${key}-p${t}-f.jpg`)) n0 = t;
    if (n0 + oldPoints.points.length > 99) { r.status = 'error'; r.why = '地点の番号が 99 を超える'; return r; }
    const pts = [], shas = {};
    for (const [i, p] of oldPoints.points.entries()) {
      const faces = await capture(page, p.pos, p.yaw, 0, r, p.id + ':');
      const id = 'p' + (n0 + i + 1);
      for (const [k, b] of Object.entries(faces)) { fs.writeFileSync(path.join(dir, `${id}-${k}.jpg`), b); uploads.push([`pano/${key}-${id}-${k}.jpg`, b]); }
      shas[id] = Object.fromEntries(Object.entries(faces).map(([k, b]) => [k, sha(b)]));
      pts.push({ ...p, id, was: p.id });
    }
    newPts = { ...oldPoints, points: pts, faces: shas, size: SIZE, bakedAt: r.at };
  }
  if (LOCAL) { r.status = 'local'; r.dir = dir; return r; }
  for (const [k, b] of uploads) if (!await r2Head(k)) await r2PutNew(k, b, 'image/jpeg');
  // 画像を置き終えてから JSON を差し替える（これを見て新しい画像を使う）
  const swap = async (k, old, body) => {
    await r2PutNew(k.replace(/\.json$/, `.bak-${Date.now()}.json`), Buffer.from(JSON.stringify(old)), 'application/json');
    const buf = Buffer.from(JSON.stringify(body));
    await r2Retry(() => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: buf, ContentType: 'application/json', Metadata: { sha256: sha(buf) } })));
  };
  if (newMeta) await swap(`pano/${key}.json`, meta, newMeta);
  if (newPts) await swap(`pano/${key}.points.json`, oldPoints, newPts);
  r.bytes = uploads.reduce((a, [, b]) => a + b.length, 0);
  r.status = 'fixed'; r.reshot = { start: needStart, points: needPts ? newPts.points.length : 0 };
  return r;
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
    if (RESHOOT) {
      if (!await r2Head(`pano/${key}.json`)) { r.status = 'ok'; r.why = '開始位置の画像なし（撮り直し対象外）'; return r; }
      const op = await r2Head(`pano/${key}.points.json`) ? await r2Json(`pano/${key}.points.json`) : null;
      return await reshoot(page, s, key, op, r);
    }
    const hasStart = !LOCAL && !!await r2Head(`pano/${key}.json`);
    const oldPoints = POINTS && !LOCAL && await r2Head(`pano/${key}.points.json`) ? await r2Json(`pano/${key}.points.json`) : null;
    // AI の判定が無い地点（2026-11-20 より前に作ったもの）は作り直す対象
    const oldGraph = GRAPH && !LOCAL && await r2Head(`pano/${key}.graph.json`) ? await r2Json(`pano/${key}.graph.json`) : null;
    const hasPoints = GRAPH ? (!!oldGraph && !REDO) : !POINTS || (!!oldPoints && !REDO && (!AI || !!oldPoints.review));
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
    if (!hasStart && !PROBE) {
      const faces = startCaptured = await capture(page, pose, pose.yaw, 0, r, '');
      for (const [k, b] of Object.entries(faces)) { fs.writeFileSync(path.join(dir, `${k}.jpg`), b); uploads.push([`pano/${key}-${k}.jpg`, b]); }
      const meta = { v: 1, pos: { x: pose.x, y: pose.y, z: pose.z }, yaw: pose.yaw, pitch: pose.pitch, size: SIZE, bakedAt: r.at, scene: s.scene,
        faces: Object.fromEntries(Object.entries(faces).map(([k, b]) => [k, sha(b)])) };
      metaBody = Buffer.from(JSON.stringify(meta));
      fs.writeFileSync(path.join(dir, 'meta.json'), metaBody);
    }
    let graphBody = null;
    if (!hasPoints && GRAPH) {
      graphBody = await graphPoints(page, pose, key, dir, r, uploads);
      if (PROBE) { r.status = 'probe'; r.dir = dir; return r; }
      // 歩ける床が取れなかった（当たり判定が細切れ・開始位置が家具の上など）時は graph.json を置かない。今の points.json の写真ツアーを残す
      const ga = graphBody && JSON.parse(graphBody.toString()).audit;
      if (graphBody && !(ga?.nodes > 0) && !(ga?.area >= 15)) {
        graphBody = null; r.status = 'error'; r.why = `歩ける床が取れない（${ga?.area ?? 0}㎡）`;
        for (let i = uploads.length - 1; i >= 0; i--) if (/-g[0-9a-f]{6}-n\d+-/.test(uploads[i][0])) uploads.splice(i, 1);
      }
    } else if (!hasPoints) {
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
    if (graphBody) {
      if (oldGraph) await r2PutNew(`pano/${key}.graph.bak-${Date.now()}.json`, Buffer.from(JSON.stringify(oldGraph)), 'application/json');
      await r2Retry(() => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `pano/${key}.graph.json`, Body: graphBody, ContentType: 'application/json', Metadata: { sha256: sha(graphBody) } })));
    }
    if (pointsBody && pointsBody.length) {
      if (oldPoints) {
        // 置き換え: 今の points.json は控えとして残す（/api/pano は出さない名前）。ビューアーは points.json を no-cache で取るので、すぐ新しい方になる
        await r2PutNew(`pano/${key}.points.bak-${Date.now()}.json`, Buffer.from(JSON.stringify(oldPoints)), 'application/json');
        await r2Retry(() => s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `pano/${key}.points.json`, Body: pointsBody, ContentType: 'application/json', Metadata: { sha256: sha(pointsBody) } })));
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
