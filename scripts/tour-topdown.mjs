// シーンを真上から見た図（天井を外す）＋ 1m 方眼・座標の目盛り＋今の写真ツアーの地点を描く（2026-11-23）。
//   本人「描画位置微妙 TKの上から見た図を私が点を打つので参考にして 図をくれ」。本人が点を打った図から、地点の座標へ読み戻せるように
//   図の座標の対応（中心・1m あたりの画素）を <名前>.json に残す。
//   天井は、真上のカメラの近い側の切り取り面（near）で床から CUT m より上を落として消す。
//   node scripts/tour-topdown.mjs <scene autoload> [--cut=2.0] [--px=1600] [--out=dir]
//   2 階建て（2026-11-26 Tasuki）: --floor=<床の高さ> --tag=1F で階ごとの図。--side=<z> は z の位置で縦に切った横からの図（階の高さを読む用、±0.6m の厚み）
import { chromium } from 'file:///F:/Htlml/3DGS/locahun3d_online/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const scene = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const CUT = Number(opt('cut', '2.0')), PX = Number(opt('px', '1600'));
const OUT = opt('out', 'F:/Codex/viewerfix/artifacts/topdown');
fs.mkdirSync(OUT, { recursive: true });
const ORIGIN = 'https://locahun3d.com';
const name = decodeURIComponent(scene.split('/').pop()).replace(/\.zip$/, '').replace(/^[A-Za-z0-9_-]{10}-/, '') + (process.argv.find((a) => a.startsWith('--tag=')) ? '_' + process.argv.find((a) => a.startsWith('--tag=')).slice(6) : '');

// 今の写真ツアー（本番の graph.json）
const head = await fetch(ORIGIN + scene, { method: 'HEAD' });
const etag = (head.headers.get('etag') || '').replace(/"/g, ''), len = head.headers.get('content-length') || head.headers.get('x-content-length');
const key = crypto.createHash('sha256').update(`l3d-pano-v1:etag:${etag}:${len}`).digest('hex');
const graph = await (await fetch(`${ORIGIN}/api/pano/${key}.graph.json`)).json().catch(() => null);
const meta = await (await fetch(`${ORIGIN}/api/pano/${key}.json`)).json().catch(() => null);
const nodes = graph?.nodes || [];
const start = graph?.start || meta?.pos;
const floors = nodes.map((n) => n.floorY).filter(Number.isFinite).sort((a, b) => a - b);
const floorY = opt('floor') != null ? Number(opt('floor')) : floors.length ? floors[Math.floor(floors.length / 2)] : (start.y - 1.5);
const TAG = opt('tag', ''), SIDE = opt('side') != null ? Number(opt('side')) : null;
const xs = [start.x, ...nodes.map((n) => n.pos.x)], zs = [start.z, ...nodes.map((n) => n.pos.z)];
const M = 5;   // 地点の外側の余白（m）
const minX = Math.min(...xs) - M, maxX = Math.max(...xs) + M, minZ = Math.min(...zs) - M, maxZ = Math.max(...zs) + M;
const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, half = Math.max(maxX - minX, maxZ - minZ) / 2;
const FOV = 16, D = half / Math.tan((FOV / 2) * Math.PI / 180);
const ppm = PX / 2 / half;   // 1m あたりの画素（床の高さで）
console.log(name, 'key', key.slice(0, 12), 'nodes', nodes.length, 'floorY', floorY, 'extent', (2 * half).toFixed(1) + 'm');

const ANCHOR = 'const camPos  = new THREE.Vector3(0, 1.7, 4);';
const HOOK = `;window.__td={
 n:()=>window.__nSplat?window.__nSplat():-1,
 busy:()=>{try{return sparkRenderer&&sparkRenderer.pager?sparkRenderer.pager.fetchers.filter(f=>f.chunk>=0).length:0;}catch(_){return 0;}},
 budget:(n)=>{try{window._gpuWatchdog=window._gpuWatchdog||{};window._gpuWatchdog.manualOverride=true;sparkRenderer.lodSplatCount=n;return n;}catch(_){return -1;}},
 aim:(o)=>{const T=window.__dbg.THREE;if(!window.__tdCam){window.__tdCam=new T.PerspectiveCamera(o.fov,1,o.near,o.far);const R=renderer,orig=R.render.bind(R);R.render=(sc,cam)=>orig(sc,cam===camera?window.__tdCam:cam);}
   const c=window.__tdCam;c.fov=o.fov;c.near=o.near;c.far=o.far;c.aspect=1;c.updateProjectionMatrix();c.position.set(o.x,o.y,o.z);if(o.side){c.up.set(0,1,0);c.lookAt(o.x,o.y,o.z-1);}else{c.up.set(0,0,-1);c.lookAt(o.x,o.y-1,o.z);}c.updateMatrixWorld(true);
   try{camPos.set(o.x,o.fy+1.5,o.z);}catch(_){}markDirty(60);},
};`;
let html = await (await fetch(`${ORIGIN}/viewer/offline-viewer.html`)).text();
if (!html.includes(ANCHOR)) throw new Error('viewer anchor not found');
html = html.replace(ANCHOR, ANCHOR + HOOK);

const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=900,950'] });
const ctx = await b.newContext({ viewport: { width: 800, height: 800 }, deviceScaleFactor: PX / 800 });
const p = await ctx.newPage();
await p.route((u) => u.host === 'locahun3d.com' && u.pathname === '/viewer/offline-viewer.html', (r) => r.fulfill({ status: 200, body: html, headers: { 'content-type': 'text/html; charset=utf-8' } }));
await p.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/api/pano/'), (r) => r.fulfill({ status: 404, body: '' }));   // 360° 画像は出さない（3D を撮る）
await p.goto(`${ORIGIN}/viewer/offline-viewer.html?autoload=${encodeURIComponent(scene)}&protected=1&nopano=1`, { waitUntil: 'domcontentloaded' });
const t0 = Date.now(); while (Date.now() - t0 < 120000 && (await p.evaluate(() => window.__td && window.__td.n()).catch(() => -1)) <= 0) await p.waitForTimeout(500);
await p.evaluate(() => window.__td.budget(12000000));
// UI を消す
await p.addStyleTag({ content: 'body > *:not(canvas):not(#canvas-container):not(.canvas-wrap){visibility:hidden !important} canvas{visibility:visible !important}' }).catch(() => {});
const aim = SIDE != null ? { side: true, x: cx, y: floorY + 1, z: SIDE + D, fy: floorY, fov: FOV, near: D - 0.6, far: D + 0.6 }
  : { x: cx, y: floorY + D, z: cz, fy: floorY, fov: FOV, near: Math.max(0.1, D - CUT), far: D + 4 };
await p.evaluate((o) => window.__td.aim(o), aim);
// 読み込みが落ち着くまで
let last = -1, same = 0; const t1 = Date.now();
while (Date.now() - t1 < 150000) { await p.waitForTimeout(1500); await p.evaluate((o) => window.__td.aim(o), aim);
  const s = await p.evaluate(() => ({ n: window.__td.n(), busy: window.__td.busy() })); if (s.n === last && s.busy === 0) { if (++same >= 3) break; } else same = 0; last = s.n; }
const raw = path.join(OUT, `${name}_raw.png`);
const cvs = await p.$('canvas');
await (cvs || p).screenshot({ path: raw });
await b.close();
const info = { scene, name, key, floorY, cut: CUT, px: PX, center: { x: cx, z: cz }, half, ppm,
  note: '図の画素 (u,v) → 世界 x = center.x + (u - px/2) / ppm, z = center.z + (v - px/2) / ppm（右 = +x、下 = +z）', start, nodes: nodes.map((n) => ({ id: n.id, x: n.pos.x, z: n.pos.z, floorY: n.floorY })) };
fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(info, null, 1));
console.log('raw', raw);
