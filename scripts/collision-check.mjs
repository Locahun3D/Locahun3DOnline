// 公開シーンの「事前に作った当たり判定」を検査・作成・検証する（2026-11-10 本人「あたり判定、最初からないと移動できず不便」
// 「アップ時にきちんとできているかもチェックする体制を」）。
//
// ビューアーは開いた直後、シーンの中身の識別子と配置から決まる 64 桁のキーで /api/collision/<key>.lct を 1 回取りに来る
// （あれば数百KBで即座に当たり判定が整い、本体 RAD の読み直し＝約180MB をしない）。このスクリプトは本番のシーンを
// 実ブラウザ（Chrome・画面あり・GPU）で開き、ビューアー自身が計算したキーを使うので、キーの食い違いが起きない。
//
//   node scripts/collision-check.mjs --all                 全公開シーンを OK / project / missing / stale / broken で一覧
//   node scripts/collision-check.mjs --all --fix           悪いものだけ作り直して R2 に追加 → 検証
//   node scripts/collision-check.mjs --property studio-babel[,slug2] [--fix]
//   node scripts/collision-check.mjs --scene /api/viewer-stream/assets/splat/<zip> [--fix]   （下書きの登録直後もこれ）
//   オプション: --resume [時間=24]（直近に OK だったシーンを飛ばす）/ --limit N / --viewer <html>|prod / --endpoint auto|prod|emulate
//              --travel-sec 10（検証: 最初の描画からクリック移動できるまでの上限）/ --out artifacts/collision
//
// 判定:
//   OK       R2 にある・サイズと sha256 が一致・ビューアーがそれを使った（source=prebaked）・クリック移動できた
//   project  シーンのプロジェクトに当たり判定が保存済み（配る必要なし）
//   missing  まだ作っていない
//   stale    このシーン用に作ったものはあるがキーが違う（差し替え・回転などでシーンが変わった）→ --fix で作り直す
//   broken   R2 の中身が壊れている／ビューアーが受け付けない／移動できない。R2 は追加のみなので自動では消さない
//   error    シーンが開けない（権限・読み込み失敗）
// 終了コード: 全シーンが OK/project/fixed なら 0、それ以外は 1（黙って通さない）。
//
// R2 への書き込みは「新しいキーの追加」だけ（collision/<key>.lct と collision/by-scene/<scene>/<key>.json）。
// 既にあるキーは上書きしない（同じ中身なら何もしない・違えば broken として報告）。
// R2 の鍵は Windows のユーザー環境変数 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET（表示しない）。
//
// /api/collision が本番に未デプロイの間（--endpoint auto が判定）は、同じ応答を R2 から手元で返して検証する（emulate）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://locahun3d.com';
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const FIX = flag('--fix');
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const TRAVEL_SEC = Number(arg('--travel-sec', 10));
const OUT = path.resolve(ROOT, arg('--out', 'artifacts/collision'));
const VIEWER = arg('--viewer', path.join(ROOT, 'public/viewer/offline-viewer.html'));
const RESUME_H = flag('--resume') ? Number(arg('--resume', 24)) || 24 : 0;
fs.mkdirSync(OUT, { recursive: true });

const C = { red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m` };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sceneHash = (scene) => sha(Buffer.from(scene, 'utf8')).slice(0, 32);

// ── R2（鍵は表示しない） ──
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
const objKey = (key) => `collision/${key}.lct`;
async function r2Head(k) {
  try { return await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: k })); }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null; throw e; }
}
async function r2Get(k) {
  try { const o = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: k })); return { body: Buffer.from(await o.Body.transformToByteArray()), meta: o.Metadata || {} }; }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return null; throw e; }
}
async function r2PutNew(k, body, meta, type) {
  // 追加のみ: If-None-Match: * で既存キーへの上書きを R2 側でも拒否させる。
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: body, ContentType: type, Metadata: meta, IfNoneMatch: '*' }));
}
async function r2SceneKeys(scene) {
  const prefix = `collision/by-scene/${sceneHash(scene)}/`;
  const out = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  return (out.Contents || []).map((o) => o.Key.slice(prefix.length).replace(/\.json$/, ''));
}
// R2 の中身を確かめる: 存在・メタデータの sha256・サイズ・実際のバイトの sha256。
async function r2Verify(key) {
  const got = await r2Get(objKey(key));
  if (!got) return { ok: false, why: 'R2 にない' };
  const want = got.meta.sha256;
  if (!/^[a-f0-9]{64}$/.test(want || '')) return { ok: false, why: 'R2 のメタデータに sha256 がない' };
  if (sha(got.body) !== want) return { ok: false, why: 'sha256 が一致しない' };
  if (!got.body.length || got.body.length > 16_000_000) return { ok: false, why: 'サイズが不正 ' + got.body.length };
  return { ok: true, bytes: got.body.length, sha256: want, body: got.body };
}

// ── 対象シーン ──
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

// ── 本番に /api/collision があるか（無ければ同じ応答を R2 から手元で返す） ──
async function detectEndpoint() {
  const want = arg('--endpoint', 'auto');
  if (want !== 'auto') return want;
  try {
    const r = await fetch(`${ORIGIN}/api/collision/${'0'.repeat(64)}.lct`, { method: 'HEAD' });
    const deployed = r.status === 404 && (r.headers.get('cache-control') || '') === 'no-store' && !(r.headers.get('content-type') || '').includes('text/html');
    return deployed ? 'prod' : 'emulate';
  } catch { return 'emulate'; }
}

// ── ブラウザ ──
const ANCHOR = 'const camPos  = new THREE.Vector3(0, 1.7, 4);';
const HOOK = `;window.__cc={toasts:[],
 n:()=>window.__nSplat?window.__nSplat():-1,
 walk:()=>window.__walkState?window.__walkState():null,
 whole:()=>walkSetup.wholeIndex&&walkSetup.settings.whole?{key:walkSetup.settings.whole.key,data:walkSetup.settings.whole.data}:null,
 cam:()=>camPos.toArray(),
 turn:(a)=>{setCamRotImmediate(yaw+a,-0.25);markDirty(8);},
 moving:()=>!!_clickNavigationController?.active,
 label:()=>{const b=document.getElementById('camera-collision-toggle');return b?b.textContent+'|'+b.title:'';},
 grid:()=>{const r=canvas.getBoundingClientRect(),out=[];for(let j=0;j<3;j++)for(let i=0;i<5;i++){const x=r.left+r.width*(0.15+0.7*i/4),y=r.top+r.height*(0.6+0.3*j/2);
   let v=null;try{v=_clickNavigateAt(x,y,true);}catch(e){v=null;}if(v&&v.valid&&v.point)out.push({x:Math.round(x),y:Math.round(y),d:Math.hypot(v.point.x-camPos.x,v.point.z-camPos.z)});}return out;},
};
try{const _t=showUndoToast;showUndoToast=function(m){window.__cc.toasts.push(String(m));return _t.apply(this,arguments);};}catch(_){}`;
let viewerHtml = null;
async function getViewerHtml() {
  if (viewerHtml) return viewerHtml;
  const html = VIEWER === 'prod' ? await text(`${ORIGIN}/viewer/offline-viewer.html`) : fs.readFileSync(VIEWER, 'utf8');
  if (!html.includes(ANCHOR)) throw new Error('viewer anchor not found');
  if (!html.includes('_wholeFetchPrebaked')) throw new Error('この viewer は事前作成の当たり判定に対応していない（--viewer を確認）');
  viewerHtml = html.replace(ANCHOR, ANCHOR + HOOK);
  return viewerHtml;
}
const BAD_TEXT = /未準備|準備中|Not ready|Preparing/;

// 1 シーンを新しい（記録の無い）コンテキストで開く。collision: 'r2'（R2 から返す）/ 'prod'（本番へ素通し）/ 'none'（404 にして作らせる）。
async function openScene(browser, scene, collision) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const rec = { requests: [], errors: [], labels: new Set(), streamBytes: 0 };
  page.on('pageerror', (e) => rec.errors.push(String(e).slice(0, 200)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/collision/')) rec.requests.push({ name: u.split('/').pop(), status: r.status() });
    else if (r.status() >= 400 && !u.endsWith('favicon.svg')) rec.errors.push(`HTTP ${r.status()} ${u.slice(0, 160)}`);
  });
  const html = await getViewerHtml();
  if (VIEWER === 'prod') await page.route((u) => u.host === 'locahun3d.com' && u.pathname === '/viewer/offline-viewer.html', (route) => route.fulfill({ status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } }));
  else await page.route((u) => u.host === 'locahun3d.com' && ['/viewer/offline-viewer.html', '/viewer/rad-chunk-cache.js'].includes(u.pathname), (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('.js')) return route.fulfill({ status: 200, body: fs.readFileSync(path.join(path.dirname(VIEWER), 'rad-chunk-cache.js')), headers: { 'content-type': 'text/javascript' } });
    return route.fulfill({ status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  if (collision !== 'prod') await page.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/api/collision/'), async (route) => {
    const m = /^([a-f0-9]{64})\.lct$/.exec(new URL(route.request().url()).pathname.split('/').pop());
    const none = () => route.fulfill({ status: 404, headers: { 'cache-control': 'no-store' }, body: '' });
    if (collision === 'none' || !m) return none();
    const got = await r2Get(objKey(m[1])).catch(() => null);
    if (!got || !/^[a-f0-9]{64}$/.test(got.meta.sha256 || '')) return none();
    // /api/collision/[name]/route.ts と同じヘッダー。
    return route.fulfill({ status: 200, body: got.body, headers: { 'content-type': 'application/octet-stream', 'content-length': String(got.body.length),
      'cache-control': 'public, max-age=31536000, immutable', 'x-l3d-sha256': got.meta.sha256 } });
  });
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/viewer/offline-viewer.html?autoload=${encodeURIComponent(scene)}&protected=1`, { waitUntil: 'domcontentloaded' });
  const poll = async () => {
    const st = await page.evaluate(() => ({ n: window.__cc?.n() ?? -1, w: window.__cc?.walk(), l: window.__cc?.label() })).catch(() => null);
    if (st?.l) rec.labels.add(st.l.split('|')[0]);
    if (st && rec.tFirst == null && st.n > 0) rec.tFirst = Date.now() - t0;
    if (st?.w?.whole && rec.tCollision == null) { rec.tCollision = Date.now() - t0; rec.source = st.w.source; rec.key = st.w.key; }
    return st;
  };
  return { ctx, page, rec, t0, poll };
}

// クリック移動: 画面下半分の格子で行き先の判定が出る点を探し、実際にマウスでクリックして 0.3m 以上動くか。
async function tryTravel(page) {
  for (let turn = 0; turn < 4; turn++) {
    const opts = (await page.evaluate(() => window.__cc.grid()).catch(() => [])).sort((a, b) => b.d - a.d);
    if (opts.length) {
      const before = await page.evaluate(() => window.__cc.cam());
      const o = opts[Math.floor(opts.length / 2)];
      await page.mouse.click(o.x, o.y);
      await page.waitForTimeout(150);
      const t1 = Date.now(); while (Date.now() - t1 < 6000 && await page.evaluate(() => window.__cc.moving())) await page.waitForTimeout(100);
      const after = await page.evaluate(() => window.__cc.cam());
      const d = Math.hypot(after[0] - before[0], after[2] - before[2]);
      if (d > 0.3) return d;
    }
    await page.evaluate(() => window.__cc.turn(Math.PI / 2)); await page.waitForTimeout(600);
  }
  return 0;
}

// 検証: 新しいコンテキストで開き、事前作成の判定が使われ（作り直しなし）、未準備・準備中が出ず、すぐクリック移動できること。
async function verifyScene(browser, scene, key, endpoint) {
  const v = await openScene(browser, scene, endpoint === 'prod' ? 'prod' : 'r2');
  const fails = [];
  try {
    let travel = 0;
    while (Date.now() - v.t0 < 60000) {
      const st = await v.poll();
      if (v.rec.tFirst != null && !travel && Date.now() - v.t0 > v.rec.tFirst + 500) {
        travel = await tryTravel(v.page);
        if (travel) v.rec.tTravel = Date.now() - v.t0;
      }
      if (v.rec.tCollision != null && travel) break;
      if (v.rec.tCollision != null && Date.now() - v.t0 > v.rec.tCollision + 15000) break;
      await v.page.waitForTimeout(250);
      void st;
    }
    const toasts = await v.page.evaluate(() => window.__cc.toasts).catch(() => []);
    const req = v.rec.requests.find((r) => r.name === `${key}.lct`);
    if (!req) fails.push('ビューアーが /api/collision/' + key.slice(0, 12) + '… を取りに来ない（キー不一致の可能性）');
    else if (req.status !== 200) fails.push('/api/collision の応答が ' + req.status);
    if (v.rec.tCollision == null) fails.push('60 秒以内に当たり判定が整わない');
    else if (v.rec.source !== 'prebaked') fails.push('事前作成のファイルを使っていない（source=' + v.rec.source + '）');
    if (v.rec.key && v.rec.key !== key) fails.push('キーが違う ' + v.rec.key.slice(0, 12));
    const bad = [...v.rec.labels].filter((l) => BAD_TEXT.test(l)).concat(toasts.filter((t) => BAD_TEXT.test(t) && /当たり判定|collision/i.test(t)));
    if (bad.length) fails.push('表示に「' + [...new Set(bad)].join('／') + '」が出た');
    if (!v.rec.tTravel) fails.push('クリック移動できない');
    else if (v.rec.tFirst != null && v.rec.tTravel - v.rec.tFirst > TRAVEL_SEC * 1000) fails.push(`クリック移動まで ${((v.rec.tTravel - v.rec.tFirst) / 1000).toFixed(1)} 秒（上限 ${TRAVEL_SEC} 秒）`);
    if (v.rec.errors.some((e) => e.startsWith('pageerror'))) fails.push('ページのエラー: ' + v.rec.errors[0]);
    return { ok: !fails.length, fails, tFirst: v.rec.tFirst, tCollision: v.rec.tCollision, tTravel: v.rec.tTravel };
  } finally { await v.ctx.close(); }
}

// ── 本体 ──
const statePath = path.join(OUT, 'state.json');
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
const viewerSha = sha(Buffer.from(fs.existsSync(VIEWER) ? fs.readFileSync(VIEWER) : VIEWER)).slice(0, 12);

const endpoint = await detectEndpoint();
let scenes = await listScenes();
if (RESUME_H) scenes = scenes.filter((s) => { const p = state[s.scene]; return !(p && ['OK', 'project', 'fixed'].includes(p.status) && Date.now() - Date.parse(p.at) < RESUME_H * 3600e3); });
scenes = scenes.slice(0, LIMIT);
console.log(`scenes ${scenes.length} / endpoint ${endpoint} / viewer ${VIEWER === 'prod' ? 'prod' : path.relative(ROOT, VIEWER)} / ${FIX ? 'fix' : 'check only'}`);

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1300,860', '--ignore-gpu-blocklist'] });
const results = [];
for (const s of scenes) {
  const r = { property: s.property, scene: s.scene, at: new Date().toISOString() };
  const label = `${s.property || '-'} ${decodeURIComponent(s.scene.split('/').pop()).slice(0, 60)}`;
  try {
    // 1) 開いて、ビューアーが取りに来るキーと結果を見る（R2 に無ければ 404 → ビューアーが手元で作り始める）。
    const o = await openScene(browser, s.scene, endpoint === 'prod' ? 'prod' : 'r2');
    try {
      let key = null;
      while (Date.now() - o.t0 < 90000) {
        await o.poll();
        key = o.rec.requests[0]?.name?.replace(/\.lct$/, '') || o.rec.key;
        if (o.rec.tCollision != null) break;
        if (o.rec.requests[0] && o.rec.requests[0].status !== 200 && !FIX) break;
        await o.page.waitForTimeout(250);
      }
      if (o.rec.tFirst == null && !key) { r.status = 'error'; r.why = '開けない: ' + (o.rec.errors[0] || '読み込みタイムアウト'); }
      else if (!o.rec.requests.length && o.rec.source === 'cache') { r.status = 'project'; r.key = o.rec.key; }
      else if (!o.rec.requests.length) { r.status = 'error'; r.why = 'ビューアーが /api/collision を取りに来ない（source=' + o.rec.source + '）'; }
      else {
        r.key = key;
        const req = o.rec.requests[0];
        if (req.status === 200) {
          const chk = await r2Verify(key);
          if (!chk.ok) { r.status = 'broken'; r.why = chk.why; }
          else if (o.rec.source !== 'prebaked') { r.status = 'broken'; r.why = 'ビューアーが受け付けない（source=' + o.rec.source + '）'; }
          else r.status = 'present';
        } else {
          const others = (await r2SceneKeys(s.scene)).filter((k) => k !== key);
          const exists = await r2Head(objKey(key));
          if (exists) { r.status = 'broken'; r.why = 'R2 にあるが配信で使えない（メタデータ不足?）'; }
          else { r.status = others.length ? 'stale' : 'missing'; if (others.length) r.previousKeys = others; }
        }
      }
      // 2) 作り直し: 同じページでビューアーが作るのを待ち、ビューアーが計算したキーと中身をそのまま R2 に追加する。
      if (FIX && ['missing', 'stale'].includes(r.status)) {
        while (Date.now() - o.t0 < 600000 && o.rec.tCollision == null) { await o.poll(); await o.page.waitForTimeout(500); }
        const whole = await o.page.evaluate(() => window.__cc.whole()).catch(() => null);
        if (!whole || o.rec.source !== 'bake') throw new Error('作成に失敗（source=' + o.rec.source + '）');
        if (whole.key !== r.key) throw new Error('作ったキーが取りに来たキーと違う');
        const body = Buffer.from(whole.data, 'base64');
        if (!body.length || body.length > 16_000_000) throw new Error('サイズが不正 ' + body.length);
        const digest = sha(body);
        const meta = { sha256: digest, scene: encodeURIComponent(s.scene).slice(0, 1500), bakedat: new Date().toISOString(), viewer: viewerSha };
        if (await r2Head(objKey(whole.key))) throw new Error('同じキーが既にある（上書きしない）');
        await r2PutNew(objKey(whole.key), body, meta, 'application/octet-stream');
        await r2PutNew(`collision/by-scene/${sceneHash(s.scene)}/${whole.key}.json`,
          Buffer.from(JSON.stringify({ scene: s.scene, property: s.property, key: whole.key, sha256: digest, bytes: body.length, bakedAt: meta.bakedat, viewer: viewerSha }, null, 1)), {}, 'application/json');
        r.uploaded = { key: objKey(whole.key), bytes: body.length, sha256: digest };
        r.status = 'uploaded';
      }
    } finally { await o.ctx.close(); }
    // 3) 検証（R2 にあるもの・今上げたもの）。
    if (['present', 'uploaded'].includes(r.status)) {
      const chk = await r2Verify(r.key);
      if (!chk.ok) { r.status = 'broken'; r.why = chk.why; }
      else {
        const v = await verifyScene(browser, s.scene, r.key, endpoint);
        r.verify = v;
        if (endpoint === 'prod') {
          const p = await fetch(`${ORIGIN}/api/collision/${r.key}.lct`, { method: 'HEAD' });
          if (p.status !== 200 || p.headers.get('x-l3d-sha256') !== chk.sha256) v.fails.push('本番の /api/collision が R2 と一致しない'), v.ok = false;
        }
        r.status = v.ok ? (r.status === 'uploaded' ? 'fixed' : 'OK') : 'broken';
        if (!v.ok) r.why = v.fails.join(' / ');
      }
    }
  } catch (e) { r.status = r.status === 'missing' || r.status === 'stale' ? 'broken' : 'error'; r.why = String(e?.message || e).slice(0, 300); }
  const good = ['OK', 'project', 'fixed'].includes(r.status);
  const t = r.verify ? ` 描画${(r.verify.tFirst / 1000).toFixed(1)}s 判定${(r.verify.tCollision / 1000).toFixed(1)}s 移動${r.verify.tTravel ? (r.verify.tTravel / 1000).toFixed(1) + 's' : '×'}` : '';
  console.log((good ? C.green : ['missing', 'stale'].includes(r.status) ? C.yellow : C.red)(`[${r.status}] ${label}${r.key ? ' ' + r.key.slice(0, 12) : ''}${t}${r.why ? ' — ' + r.why : ''}`));
  state[s.scene] = { status: r.status, key: r.key || null, at: r.at, why: r.why || undefined };
  saveState();
  fs.appendFileSync(path.join(OUT, 'runs.jsonl'), JSON.stringify(r) + '\n');
  results.push(r);
}
await browser.close();
const count = results.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {});
console.log('summary ' + JSON.stringify(count));
const bad = results.filter((r) => !['OK', 'project', 'fixed'].includes(r.status));
if (bad.length) { console.log(C.red(`NG ${bad.length} シーン${FIX ? '' : '（--fix で missing / stale を作り直す）'}`)); process.exit(1); }
console.log(C.green('すべて OK'));
