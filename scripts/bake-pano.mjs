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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://locahun3d.com';
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const FIX = flag('--fix') || flag('--local');
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
  viewerHtml = html.replace(ANCHOR, ANCHOR + HOOK);
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
    if (!LOCAL && await r2Head(`pano/${key}.json`)) { r.status = 'ok'; return r; }
    r.status = 'missing';
    if (!FIX) return r;
    // シーンが出て、ビューアーが開始位置を置き終えるまで待つ
    const t1 = Date.now(); while (Date.now() - t1 < 120000 && (await page.evaluate(() => window.__pb.n()).catch(() => -1)) <= 0) await page.waitForTimeout(500);
    await page.waitForTimeout(3000);
    const pose = await page.evaluate(() => window.__pb.pose());
    if (![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) { r.status = 'error'; r.why = '開始位置が取れない'; return r; }
    await page.evaluate(() => window.__pb.budget(8000000));
    // 画面の飾り（ボタン・色味の重ね・案内）を消し、3D のキャンバスだけを撮る（色味の重ねはビューアーが画像の上にも同じく重ねる）
    await page.addStyleTag({ content: 'body>*:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}' });
    const faces = {};
    for (const [k, [dy, p]] of Object.entries(FACES)) {
      await page.evaluate(([pos, yw, pt]) => window.__pb.aim(pos, yw, pt), [pose, pose.yaw + dy, p]);
      const ok = await settle(page, 90000);
      if (!ok) r.slow = (r.slow || '') + k;
      await page.waitForTimeout(400);
      faces[k] = await page.locator('canvas').first().screenshot({ type: 'jpeg', quality: QUALITY });
    }
    // 手元にも残す（見返し用）
    const dir = path.join(OUT, key.slice(0, 16)); fs.mkdirSync(dir, { recursive: true });
    for (const [k, b] of Object.entries(faces)) fs.writeFileSync(path.join(dir, `${k}.jpg`), b);
    const meta = { v: 1, pos: { x: pose.x, y: pose.y, z: pose.z }, yaw: pose.yaw, pitch: pose.pitch, size: SIZE, bakedAt: r.at, scene: s.scene,
      faces: Object.fromEntries(Object.entries(faces).map(([k, b]) => [k, sha(b)])) };
    const metaBody = Buffer.from(JSON.stringify(meta));
    fs.writeFileSync(path.join(dir, 'meta.json'), metaBody);
    if (LOCAL) { r.status = 'local'; r.dir = dir; return r; }
    for (const [k, b] of Object.entries(faces)) if (!await r2Head(`pano/${key}-${k}.jpg`)) await r2PutNew(`pano/${key}-${k}.jpg`, b, 'image/jpeg');
    await r2PutNew(`pano/${key}.json`, metaBody, 'application/json');   // 最後に置く（これがあれば使われる）
    r.status = 'fixed'; r.bytes = Object.values(faces).reduce((a, b) => a + b.length, 0) + metaBody.length;
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
  const color = ['ok', 'fixed', 'local'].includes(r.status) ? C.green : r.status === 'missing' ? C.yellow : C.red;
  console.log(color(`[${r.status}] ${s.property || ''} ${s.scene.split('/').pop()}${r.key ? ' ' + r.key.slice(0, 12) : ''}${r.slow ? ' 遅い面:' + r.slow : ''}${r.why ? ' — ' + r.why : ''}`));
}
await browser.close();
const bad = results.filter((r) => !['ok', 'fixed', 'local'].includes(r.status) && !(r.status === 'missing' && !FIX));
process.exit(bad.length ? 1 : 0);
