// 全シーンで「カメラが天井まで上がる」を実ブラウザで探す（2026-10-08 本人指示「他のシーンでも起こる。大規模に調査」）。
// 本番には書かない。D1 から公開・下書きのシーン一覧を取り、R2 を署名URLで読み、本番の /api/viewer-stream と同じ配り方
// （?ref=stream で ZIP 内の無圧縮 RAD だけ・同じ ETag）を手元のサーバーで再現して、手元のビューアーで開く。
// 各シーンで
//   1) 初期視点の目線（足元の床から何 m・天井まで何 m）
//   2) 4方向 × 画面の格子の各点について「クリックしたらどこへ行くか」（プレビュー判定）と、行き先の目線の余裕
//   3) 実際にクリック移動を連続で行い、毎回の目線の高さ・天井までの余裕
// を記録する。目線が床から 2.1m を超える／天井まで 0.15m 未満を「異常」として画像も残す。
//   node scripts/camera-height-audit.mjs [--only <propertyId>] [--viewer <html>] [--out <dir>] [--moves 15] [--shard 0/3] [--port 8793]
// 階段（段差を当たり判定から探して上り下り）・変なところのクリック（真上・真下・端・連打・移動中の押し直し）も見る。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const viewerFile = path.resolve(arg('--viewer', 'public/viewer/offline-viewer.html'));
const outDir = path.resolve(arg('--out', 'artifacts/camera-height-audit'));
const only = arg('--only', '');
const MOVES = Number(arg('--moves', 15));
fs.mkdirSync(outDir, {recursive: true});

// ── シーン一覧（D1・読み取りのみ） ──
function d1(sql) {
  // ⚠ Windows の wrangler は終了時に libuv の assert で落ちることがある（出力は正しい）。終了コードは見ず、JSON を読む。
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'locahun3d-db', '--remote', '--json', '--command', `"${sql}"`],
      {encoding: 'utf8', shell: true, maxBuffer: 256 << 20});
    try { const rows = JSON.parse(r.stdout.slice(r.stdout.indexOf('['), r.stdout.lastIndexOf(']') + 1))[0].results; if (Array.isArray(rows)) return rows; } catch {}
  }
  throw new Error('D1 read failed');
}
const toKey = u => (u || '').includes('/api/r2/') ? u.split('/api/r2/')[1] : (u || '');
let scenes = [];
for (const row of d1("SELECT id,status,data FROM properties WHERE status!='archived'")) {
  const d = JSON.parse(row.data);
  (d.splatItems || []).forEach((it, i) => {
    if (it.splatUrl) scenes.push({pid: row.id, status: row.status, idx: i, label: it.label || '', splat: toKey(it.splatUrl), stream: toKey(it.streamUrl)});
  });
}
if (only) { const ids = only.split(','); scenes = scenes.filter(s => ids.includes(s.pid)); }
// --scenes pid:idx,pid:idx でシーンを指定。--skip moves,targets,fuzz,stairs,corridor で段階を飛ばす。
const pickScenes = arg('--scenes', ''); if (pickScenes) { const want = pickScenes.split(','); scenes = scenes.filter(s => want.includes(`${s.pid}:${s.idx}`)); }
const SKIP = new Set(arg('--skip', '').split(',').filter(Boolean));
// --shard i/n: 何本かに分けて並べて回す（i は 0 始まり）。
const shard = arg('--shard', ''); if (shard) { const [i, n] = shard.split('/').map(Number); scenes = scenes.filter((_, k) => k % n === i); }
console.log('scenes', scenes.length);

// ── R2 署名URL（読み取り） ──
const {R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_ENDPOINT: EP, R2_BUCKET: BUCKET} = process.env;
if (!AK || !SK || !EP || !BUCKET) throw new Error('R2_* env が必要');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();
function presign(key, ttl = 6 * 3600) {
  const host = new URL(EP).host, p = '/' + BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), day = now.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const q = {'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${AK}/${scope}`, 'X-Amz-Date': now, 'X-Amz-Expires': String(ttl), 'X-Amz-SignedHeaders': 'host'};
  const cq = Object.keys(q).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`).join('&');
  const creq = ['GET', p, cq, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', now, scope, crypto.createHash('sha256').update(creq).digest('hex')].join('\n');
  const kd = hmac(hmac(hmac(hmac('AWS4' + SK, day), 'auto'), 's3'), 'aws4_request');
  return `${EP.replace(/\/$/, '')}${p}?${cq}&X-Amz-Signature=${crypto.createHmac('sha256', kd).update(sts).digest('hex')}`;
}
const upstream = (key, range) => fetch(presign(key), {headers: range ? {Range: range} : {}});

// ── 手元の配信（/api/viewer-stream と同じ振る舞い） ──
const hook = `;function core_roomy(c,x,f,z){return !c.raycastSurface({x,y:f+.05,z},{x:0,y:1,z:0},1.95);}
window.__audit={
 EYE:String(_clickNavigateAt).includes('eyeHeight=1.2)')?1.2:1.8,
 ready:()=>layers.some(L=>L.type==='splat'&&L.mesh),
 prep:async()=>{try{return await globalThis.prepareCameraCollision({force:true});}catch(e){return String(e);}},
 col:()=>globalThis.getCameraCollisionState(),
 cast:(p,dy,d)=>{const c=walkSetup.core;if(!c)return null;if(walkSetup.wholeIndex&&typeof _walkWholeCoverage==='function')_walkWholeCoverage(p,p,{drop:4,margin:.5});
   const h=c.raycastSurface({x:p.x,y:p.y,z:p.z},{x:0,y:dy,z:0},d);return h?{y:h.point.y,ny:h.normal.y/Math.hypot(h.normal.x,h.normal.y,h.normal.z)}:null;},
 at:(eye)=>{const f=__audit.cast({x:eye.x,y:eye.y,z:eye.z},-1,6),c=__audit.cast({x:eye.x,y:eye.y,z:eye.z},1,6);
   return {eye:+eye.y.toFixed(2),aboveFloor:f?+(eye.y-f.y).toFixed(2):null,headroom:c?+(c.y-eye.y).toFixed(2):null};},
 wall:(e)=>{const c=walkSetup.core;if(!c)return null;let m=null;for(let k=0;k<16;k++){const a=k*Math.PI/8,h=c.raycastSurface({x:e.x,y:e.y,z:e.z},{x:Math.cos(a),y:0,z:Math.sin(a)},2);if(h&&(m==null||h.distance<m))m=h.distance;}return m==null?null:+m.toFixed(2);},
 state:()=>({p:camPos.toArray().map(v=>+v.toFixed(2)),yaw:+yaw.toFixed(2),...__audit.at(camPos),wall:__audit.wall(camPos)}),
 look:(y,p)=>{setCamRotImmediate(y,p);markDirty(8);},
 level:()=>{setCamRotImmediate(yaw,-0.15);markDirty(8);},
 grid:()=>{const r=canvas.getBoundingClientRect(),out=[];
   for(let j=0;j<4;j++)for(let i=0;i<7;i++){const x=r.left+r.width*(0.08+0.84*i/6),y=r.top+r.height*(0.42+0.5*j/3);
     let v=null;try{v=_clickNavigateAt(x,y,true);}catch(e){v=null;}
     if(v&&v.valid&&v.point){const pt=v.point,eye={x:pt.x,y:pt.y+__audit.EYE,z:pt.z},lower=__audit.cast({x:pt.x,y:pt.y-.05,z:pt.z},-1,2.5);
       out.push({x:Math.round(x),y:Math.round(y),dest:[+pt.x.toFixed(2),+pt.y.toFixed(2),+pt.z.toFixed(2)],...__audit.at(eye),
         rise:+(pt.y-(camPos.y-1.8)).toFixed(2),under:lower&&lower.ny>.7?+(pt.y-lower.y).toFixed(2):null});}}
   return out;},
 go:(x,y)=>_clickNavigateAt(x,y),
 finite:()=>[camPos.x,camPos.y,camPos.z,yaw,pitch].every(Number.isFinite),
 rect:()=>{const r=canvas.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};},
 corridorScan:(R,step,max)=>{const o={x:camPos.x,y:camPos.y,z:camPos.z},c=walkSetup.core,E=__audit.EYE,out=[];
   const ray=(x,y,z,dx,dz)=>{const h=c.raycastSurface({x,y,z},{x:dx,y:0,z:dz},3);return h?h.distance:3;};
   for(let gx=-R;gx<=R+1e-6;gx+=step){
     if(walkSetup.wholeIndex)_walkWholeCoverage({x:o.x+gx-1,y:o.y,z:o.z-R},{x:o.x+gx+1,y:o.y,z:o.z+R},{drop:12,margin:1});
     for(let gz=-R;gz<=R+1e-6;gz+=step){const x=o.x+gx,z=o.z+gz;
       for(const f of __audit.floorsAt(x,z,o.y+3)){const y=f+E;
         if(core_roomy(c,x,f,z)===false)continue;
         const wx=ray(x,y,z,1,0)+ray(x,y,z,-1,0),wz=ray(x,y,z,0,1)+ray(x,y,z,0,-1);
         if(wx>=.5&&wx<1.2&&wz>2.5)out.push({x,y:f,z,width:+wx.toFixed(2),axis:'z'});
         else if(wz>=.5&&wz<1.2&&wx>2.5)out.push({x,y:f,z,width:+wz.toFixed(2),axis:'x'});}}}
   const pick=[],used=new Set();for(const q of out){const k=Math.round(q.x)+','+Math.round(q.z)+','+Math.round(q.y);if(used.has(k))continue;used.add(k);pick.push(q);if(pick.length>=max)break;}
   return {candidates:out.length,pick};},
 corridorStand:(q)=>{const ax=q.axis==='z'?{x:0,z:1}:{x:1,z:0};
   for(const sgn of [1,-1])for(const back of [2,1.5,1]){const x=q.x-ax.x*back*sgn,z=q.z-ax.z*back*sgn;
     if(walkSetup.wholeIndex)_walkWholeCoverage({x,y:q.y,z},q,{drop:4,margin:3});
     const fl=__audit.floorsAt(x,z,q.y+2).find(y=>Math.abs(y-q.y)<.3);
     if(fl!=null){camPos.set(x,fl+__audit.EYE,z);const ex=q.x-x,ey=q.y-camPos.y,ez=q.z-z;setCamRotImmediate(Math.atan2(ex,ez),Math.atan2(ey,Math.hypot(ex,ez)));markDirty(30);return {x:+x.toFixed(2),y:+camPos.y.toFixed(2),z:+z.toFixed(2)};}}
   return null;},
 why:(cx,cy)=>{try{if(!walkSetup.core)return 'no-core';const r=_clickResolveTarget(cx,cy,__audit.EYE);return r.fail||'ok';}catch(e){return 'error:'+String(e).slice(0,60);}},
 moving:()=>!!_clickNavigationController?.active,
 // ── 階段: 当たり判定から段差（12〜45cm）を探し、手前に立って段をタッチしたらどうなるか ──
 floorsAt:(x,z,top)=>{const c=walkSetup.core,out=[],up=n=>n&&n.y/Math.hypot(n.x,n.y,n.z)>=.7;let y=top;
   for(let k=0;k<5;k++){const h=c.raycastSurface({x,y,z},{x:0,y:-1,z:0},14);if(!h)break;if(up(h.normal))out.push(+h.point.y.toFixed(3));
     let yy=h.point.y-.05,ok=false;for(let s=0;s<40;s++,yy-=.1)if(c.isCapsuleClear({x,y:yy,z},.06,.03)){ok=true;break;}if(!ok)break;y=yy+.01;}
   return out;},
 stairScan:(R,step,max)=>{const o={x:camPos.x,y:camPos.y,z:camPos.z},cols=new Map(),cands=[];
   for(let gx=-R;gx<=R+1e-6;gx+=step){
     if(walkSetup.wholeIndex)_walkWholeCoverage({x:o.x+gx-step,y:o.y,z:o.z-R},{x:o.x+gx+step,y:o.y,z:o.z+R},{drop:12,margin:.5});
     for(let gz=-R;gz<=R+1e-6;gz+=step)cols.set(gx.toFixed(2)+','+gz.toFixed(2),__audit.floorsAt(o.x+gx,o.z+gz,o.y+3));}
   for(const [k,A] of cols){const [gx,gz]=k.split(',').map(Number);
     for(const [dx,dz] of [[step,0],[0,step]]){const B=cols.get((gx+dx).toFixed(2)+','+(gz+dz).toFixed(2));if(!B)continue;
       for(const f of A)for(const g of B){const d=g-f;
         if(d>.12&&d<.45)cands.push({lo:{x:o.x+gx,y:f,z:o.z+gz},hi:{x:o.x+gx+dx,y:g,z:o.z+gz+dz}});
         if(-d>.12&&-d<.45)cands.push({lo:{x:o.x+gx+dx,y:g,z:o.z+gz+dz},hi:{x:o.x+gx,y:f,z:o.z+gz}});}}}
   const pick=[],used=new Set();cands.sort((a,b)=>(a.lo.x*7.13+a.lo.z*3.7)%1-(b.lo.x*7.13+b.lo.z*3.7)%1);
   for(const c of cands){const key=Math.round(c.lo.x)+','+Math.round(c.lo.z)+','+Math.round(c.lo.y*2);if(used.has(key))continue;used.add(key);pick.push(c);if(pick.length>=max)break;}
   return {columns:cols.size,candidates:cands.length,pick};},
 stairStand:(from,to)=>{const dx=to.x-from.x,dz=to.z-from.z,l=Math.hypot(dx,dz)||1;
   for(const back of [1.2,.8,.4,0]){const x=from.x-dx/l*back,z=from.z-dz/l*back;
     if(walkSetup.wholeIndex)_walkWholeCoverage({x,y:from.y,z},to,{drop:4,margin:3});
     const fl=__audit.floorsAt(x,z,from.y+2).find(y=>Math.abs(y-from.y)<.3);
     if(fl!=null){camPos.set(x,fl+__audit.EYE,z);break;}}
   const ex=to.x-camPos.x,ey=to.y-camPos.y,ez=to.z-camPos.z;
   setCamRotImmediate(Math.atan2(ex,ez),Math.atan2(ey,Math.hypot(ex,ez)));markDirty(30);
   return {x:+camPos.x.toFixed(2),y:+camPos.y.toFixed(2),z:+camPos.z.toFixed(2)};},
 screenOf:(p)=>{const v=new THREE.Vector3(p.x,p.y+.02,p.z).project(camera),r=canvas.getBoundingClientRect();
   return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height,front:v.z<1};},
};`;
let viewerHtml = fs.readFileSync(viewerFile, 'utf8');
const anchor = 'const camPos  = new THREE.Vector3(0, 1.7, 4);';
if (!viewerHtml.includes(anchor)) throw new Error('hook anchor not found');
viewerHtml = viewerHtml.replace(anchor, anchor + hook);
const byKey = new Map(scenes.map(s => [s.splat, s]));
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/viewer/offline-viewer.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(viewerHtml); return; }
    if (u.pathname.startsWith('/viewer/')) {
      const f = path.resolve('public' + decodeURIComponent(u.pathname));
      if (!f.startsWith(path.resolve('public/viewer')) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', f.endsWith('.js') || f.endsWith('.mjs') ? 'application/javascript' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
      fs.createReadStream(f).pipe(res); return;
    }
    if (!u.pathname.startsWith('/api/viewer-stream/')) { res.writeHead(404); res.end(); return; }
    let key = decodeURIComponent(u.pathname.slice('/api/viewer-stream/'.length));
    const range = req.headers.range;
    if (u.searchParams.get('ref') === 'stream') {
      const s = byKey.get(key); if (!s?.stream) { res.writeHead(404); res.end(); return; }
      key = s.stream;
      const head = await upstream(key, 'bytes=0-1023'); const hb = new Uint8Array(await head.arrayBuffer()); const etag = head.headers.get('etag') || '';
      const v = new DataView(hb.buffer);
      if (v.getUint32(0, true) !== 0x04034b50 || v.getUint16(8, true) !== 0) { res.writeHead(404); res.end(); return; }
      const size = v.getUint32(18, true), off = 30 + v.getUint16(26, true) + v.getUint16(28, true);
      let from = 0, to = size - 1;
      if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); if (m[1] === '') { from = Math.max(0, size - Number(m[2])); } else { from = Number(m[1]); if (m[2]) to = Math.min(size - 1, Number(m[2])); } }
      const tag = etag.replace(/^W\//, '').replace(/"/g, '').replace(/[^A-Za-z0-9_-]/g, '_');
      const h = {'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Length': String(to - from + 1), ETag: `"l3d-content-${tag}-${off}"`, 'X-Stream-Name': 'scene.rad'};
      if (req.method === 'HEAD') { res.writeHead(200, {...h, 'Content-Length': String(size)}); res.end(); return; }
      const part = await upstream(key, `bytes=${off + from}-${off + to}`);
      if (range) h['Content-Range'] = `bytes ${from}-${to}/${size}`;
      res.writeHead(range ? 206 : 200, h);
      for await (const c of part.body) res.write(c); res.end(); return;
    }
    const r = await upstream(key, range);
    const h = {'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
    for (const k of ['content-length', 'content-range', 'etag']) if (r.headers.get(k)) h[k] = r.headers.get(k);
    res.writeHead(r.status, h);
    if (req.method === 'HEAD') { res.end(); return; }
    for await (const c of r.body) res.write(c); res.end();
  } catch (e) { try { res.writeHead(500); res.end(String(e)); } catch {} }
});
const PORT = Number(arg('--port', 8793));
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

// ── 計測 ──
const BAD = s => s && ((s.aboveFloor != null && s.aboveFloor > 2.1) || (s.headroom != null && s.headroom < 0.15));
const browser = await chromium.launch({channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist']});
const results = [];
for (const s of scenes) {
  const tag = `${s.pid}_${s.idx}`, rec = {...s, started: new Date().toISOString()};
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  rec.pageErrors = []; page.on('pageerror', e => rec.pageErrors.push(String(e).slice(0, 200)));
  const shot = async name => { await page.screenshot({path: path.join(outDir, `${tag}_${name}.png`)}).catch(() => {}); return `${tag}_${name}.png`; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/viewer/offline-viewer.html?autoload=${encodeURIComponent('/api/viewer-stream/' + s.splat)}&protected=1`);
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && !(await page.evaluate(() => window.__audit?.ready()).catch(() => false))) await page.waitForTimeout(2000);
    if (!(await page.evaluate(() => window.__audit?.ready()).catch(() => false))) throw new Error('load timeout');
    await page.waitForTimeout(8000);
    rec.prep = await Promise.race([page.evaluate(() => __audit.prep()), page.waitForTimeout(300000).then(() => 'timeout')]);
    rec.collision = await page.evaluate(() => __audit.col());
    rec.loadSec = Math.round((Date.now() - t0) / 1000);
    rec.initial = await page.evaluate(() => __audit.state());
    rec.initialShot = await shot('initial');
    const yaw0 = rec.initial.yaw;
    rec.targets = [];
    for (let k = 0; k < (SKIP.has('targets') ? 0 : 4); k++) {
      await page.evaluate(([y]) => __audit.look(y, -0.3), [yaw0 + k * Math.PI / 2]);
      await page.waitForTimeout(1500);
      for (const t of await page.evaluate(() => __audit.grid())) rec.targets.push({view: k, ...t});
    }
    await page.evaluate(([y]) => __audit.look(y, -0.15), [yaw0]);
    rec.moves = [];
    for (let m = 0; m < (SKIP.has('moves') ? 0 : MOVES); m++) {
      await page.evaluate(([y]) => __audit.look(y, -0.3), [yaw0 + m * 2.2]);
      await page.waitForTimeout(1000);
      const opts = await page.evaluate(() => __audit.grid());
      if (!opts.length) { rec.moves.push({m, skipped: 'no target'}); continue; }
      const o = opts[(m * 7 + 3) % opts.length];
      const ok = await page.evaluate(([x, y]) => __audit.go(x, y), [o.x, o.y]);
      const t1 = Date.now(); while (Date.now() - t1 < 10000 && await page.evaluate(() => __audit.moving())) await page.waitForTimeout(200);
      await page.evaluate(() => __audit.level()).catch(() => {});
      await page.waitForTimeout(600);
      const st = await page.evaluate(() => __audit.state());
      const mv = {m, ok, target: o, after: st};
      if (BAD(st)) mv.shot = await shot(`move${m}`);
      rec.moves.push(mv);
    }
    // 階段（2026-10-08 本人「階段の判定試験が甘い」）: 段の手前に立ち、段をタッチ → 上がった先で目線・天井・埋まりを見る。上りと下りの両方。
    rec.stairs = {tries: []};
    const scan = await page.evaluate(() => __audit.stairScan(12, 0.25, 16));
    rec.stairs.columns = scan.columns; rec.stairs.candidates = scan.candidates;
    for (const [i, c] of (SKIP.has('stairs') ? [] : scan.pick).entries()) for (const dir of ['up', 'down']) {
      const [from, to] = dir === 'up' ? [c.lo, c.hi] : [c.hi, c.lo];
      const stand = await page.evaluate(([a, b]) => __audit.stairStand(a, b), [from, to]);
      await page.waitForTimeout(2000);
      const sp = await page.evaluate(([b]) => __audit.screenOf(b), [to]);
      const tr = {i, dir, from, to, stand};
      if (!sp.front) { tr.result = 'offscreen'; rec.stairs.tries.push(tr); continue; }
      tr.ok = await page.evaluate(([x, y]) => __audit.go(x, y), [sp.x, sp.y]);
      const t1 = Date.now(); while (Date.now() - t1 < 8000 && await page.evaluate(() => __audit.moving())) await page.waitForTimeout(150);
      await page.waitForTimeout(400);
      tr.after = await page.evaluate(() => __audit.state());
      const a = tr.after, moved = Math.hypot(a.p[0] - stand.x, a.p[2] - stand.z) > .05 || Math.abs(a.p[1] - stand.y) > .05;
      const bad = a.aboveFloor == null || a.aboveFloor < .8 || a.aboveFloor > 1.65 || (a.headroom != null && a.headroom < .1);
      tr.result = !moved ? 'rejected' : bad ? 'bad' : 'ok';
      if (tr.result === 'rejected') { await page.evaluate(([a]) => __audit.stairStand(a.from, a.to), [{from, to}]); await page.waitForTimeout(1200); tr.why = await page.evaluate(([x, y]) => __audit.why(x, y), [sp.x, sp.y]); }
      if (tr.result !== 'ok') tr.shot = await shot(`stair${i}_${dir}_${tr.result}`);
      rec.stairs.tries.push(tr);
    }
    // 変なところをクリック（2026-10-08 本人「へんなところクリックしてバグチェックも」）: 真上・真下・画面の端・空・壁際を、
    // 連打や移動中の再クリックも混ぜて押し、毎回カメラが床から 0.8〜1.65m・天井に埋まらない・空中に浮かない・数値が壊れないかを見る。
    rec.fuzz = {tries: []};
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const R = await page.evaluate(() => __audit.rect());
    for (let i = 0; i < (SKIP.has('fuzz') ? 0 : 40); i++) {
      const before = await page.evaluate(() => __audit.state());
      const yawv = rnd() * Math.PI * 2, pit = (rnd() * 2 - 1) * 1.45;
      await page.evaluate(([y, p]) => __audit.look(y, p), [yawv, pit]);
      await page.waitForTimeout(700);
      const edge = rnd() < .35, pt = () => edge ? {x: R.l + (rnd() < .5 ? 2 : R.w - 2) * (rnd() < .5 ? 1 : 1), y: R.t + rnd() * R.h} : {x: R.l + rnd() * R.w, y: R.t + rnd() * R.h};
      const kind = rnd() < .7 ? 'single' : rnd() < .5 ? 'double' : 'redirect';
      const a = pt(); let ok = await page.evaluate(([x, y]) => __audit.go(x, y), [a.x, a.y]);
      if (kind === 'double') { await page.waitForTimeout(80); ok = await page.evaluate(([x, y]) => __audit.go(x, y), [a.x, a.y]) || ok; }
      if (kind === 'redirect') { await page.waitForTimeout(150); const b = pt(); ok = await page.evaluate(([x, y]) => __audit.go(x, y), [b.x, b.y]) || ok; }
      const t1 = Date.now(); while (Date.now() - t1 < 8000 && await page.evaluate(() => __audit.moving())) await page.waitForTimeout(150);
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => __audit.state()), fin = await page.evaluate(() => __audit.finite());
      const moved = Math.hypot(after.p[0] - before.p[0], after.p[1] - before.p[1], after.p[2] - before.p[2]) > .05;
      const bad = !fin || (moved && (after.aboveFloor == null || after.aboveFloor < .8 || after.aboveFloor > 1.65 || (after.headroom != null && after.headroom < .1)));
      const tr = {i, kind, look: [+yawv.toFixed(2), +pit.toFixed(2)], at: [Math.round(a.x), Math.round(a.y)], ok: !!ok, moved, after, result: bad ? 'bad' : moved ? 'moved' : 'stayed'};
      if (bad) tr.shot = await shot(`fuzz${i}`);
      rec.fuzz.tries.push(tr);
    }
    // 狭い通路（2026-10-08 本人「壁際の制限は階段・狭い通路で裏目に出るかも。念入りに」）: 幅 0.5〜1.2m の通路を当たり判定から探し、
    // 通路の手前 1〜2m に立って通路の床をタッチ → 移動できたか（拒否されていないか）・壁に寄りすぎていないか。
    rec.corridor = {tries: []};
    const cs = await page.evaluate(() => __audit.corridorScan(12, 0.25, 14));
    rec.corridor.candidates = cs.candidates;
    for (const [i, q] of (SKIP.has('corridor') ? [] : cs.pick).entries()) {
      const stand = await page.evaluate(([q]) => __audit.corridorStand(q), [q]);
      const tr = {i, q, stand};
      if (!stand) { tr.result = 'nostand'; rec.corridor.tries.push(tr); continue; }
      await page.waitForTimeout(2000);
      const sp = await page.evaluate(([b]) => __audit.screenOf(b), [q]);
      if (!sp.front) { tr.result = 'offscreen'; rec.corridor.tries.push(tr); continue; }
      tr.ok = await page.evaluate(([x, y]) => __audit.go(x, y), [sp.x, sp.y]);
      const t1 = Date.now(); while (Date.now() - t1 < 8000 && await page.evaluate(() => __audit.moving())) await page.waitForTimeout(150);
      await page.waitForTimeout(300);
      tr.after = await page.evaluate(() => __audit.state());
      const a = tr.after, moved = Math.hypot(a.p[0] - stand.x, a.p[2] - stand.z) > .05;
      const bad = moved && (a.aboveFloor == null || a.aboveFloor < .8 || a.aboveFloor > 1.65 || (a.headroom != null && a.headroom < .1));
      tr.result = !moved ? 'rejected' : bad ? 'bad' : 'ok';
      if (tr.result === 'rejected') tr.why = await page.evaluate(([x, y]) => __audit.why(x, y), [sp.x, sp.y]);
      if (tr.result !== 'ok') tr.shot = await shot(`corr${i}_${tr.result}`);
      rec.corridor.tries.push(tr);
    }
  } catch (e) { rec.error = String(e).slice(0, 300); await shot('error'); }
  await page.close();
  const tb = (rec.targets || []).filter(BAD), mb = (rec.moves || []).filter(x => BAD(x.after));
  const st = rec.stairs?.tries || [], cnt = r => st.filter(x => x.result === r).length;
  rec.summary = {targets: rec.targets?.length || 0, badTargets: tb.length, moves: rec.moves?.length || 0, badMoves: mb.length, initialBad: BAD(rec.initial),
    stairCandidates: rec.stairs?.candidates ?? 0, stairOk: cnt('ok'), stairRejected: cnt('rejected'), stairBad: cnt('bad'), stairOff: cnt('offscreen'),
    fuzz: rec.fuzz?.tries.length || 0, fuzzMoved: (rec.fuzz?.tries || []).filter(x => x.result === 'moved').length, fuzzBad: (rec.fuzz?.tries || []).filter(x => x.result === 'bad').length, pageErrors: rec.pageErrors?.length || 0,
    corrCandidates: rec.corridor?.candidates ?? 0, corrOk: (rec.corridor?.tries || []).filter(x => x.result === 'ok').length, corrRejected: (rec.corridor?.tries || []).filter(x => x.result === 'rejected').length, corrBad: (rec.corridor?.tries || []).filter(x => x.result === 'bad').length,
    wallClose: [...(rec.moves || []).map(x => x.after), ...st.map(x => x.result === 'ok' ? x.after : null), ...(rec.fuzz?.tries || []).map(x => x.moved ? x.after : null)].filter(a => a && a.wall != null && a.wall < .3).length};
  console.log(tag, rec.error || '', JSON.stringify(rec.summary), JSON.stringify(rec.initial || {}));
  results.push(rec);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
}
await browser.close(); server.close();
