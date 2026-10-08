// 画面の端のぼけを数値で比べる（2026-10-08 本人「カメラ端がぼける・性能を引き出せていない・画質設定の差が無い」）。
// 本番には書かない。シーンを開いて決まった視点に置き、LOD が落ち着くまで待って撮影し、左右の端と中央のシャープさ
// （ラプラシアンの分散）と描画スプラット数・fps を記録する。条件は ?edge= で切り替えて比べる。
//   node scripts/edge-sharpness.mjs --only studio-babel [--viewer <html>] [--out <dir>] [--cfg "base,q0,q2"]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const viewerFile = path.resolve(arg('--viewer', 'public/viewer/offline-viewer.html'));
const outDir = path.resolve(arg('--out', 'artifacts/edge-sharpness'));
const only = arg('--only', '');
const MOVES = Number(arg('--moves', 15));
fs.mkdirSync(outDir, {recursive: true});

// ── シーン一覧（D1・読み取りのみ） ──
function d1(sql) {
  // ⚠ Windows の wrangler は終了時に libuv の assert で落ちることがある（出力は正しい）。終了コードは見ず、JSON を読む。
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'locahun3d-db', '--remote', '--json', '--command', `"${sql}"`],
      {encoding: 'utf8', shell: true, maxBuffer: 256 << 20});
    try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('['), r.stdout.lastIndexOf(']') + 1))[0].results; } catch {}
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
if (only) scenes = scenes.filter(s => s.pid === only);
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
const hook = `;window.__edge={
 ready:()=>{if(!window.__lodWrapped&&typeof sparkRenderer!=='undefined'){window.__lodWrapped=1;const u=sparkRenderer.updateLodIndices.bind(sparkRenderer);sparkRenderer.updateLodIndices=(m,k)=>{window.__lodN=Object.values(k).reduce((a,x)=>a+x.numSplats,0);return u(m,k);};}return layers.some(L=>L.type==='splat'&&L.mesh);},
 qi:()=>[qualIdx,qualScale],
 ft:()=>{const g=window.__gpuQ;if(!g)return null;const a=g.samples.splice(0);if(!a.length)return {n:0};a.sort((x,y)=>x-y);return {n:a.length,median:+a[a.length>>1].toFixed(2),p90:+a[Math.floor(a.length*.9)].toFixed(2)};},
 gpuSetup:()=>{if(window.__gpuQ)return !!window.__gpuQ.ext;const gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');const G=window.__gpuQ={ext,samples:[],pending:[],depth:0};if(!ext)return false;
   const orig=renderer.render.bind(renderer);renderer.render=function(...a){
     while(G.pending.length&&gl.getQueryParameter(G.pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=G.pending.shift();if(!gl.getParameter(ext.GPU_DISJOINT_EXT))G.samples.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);}
     if(G.depth++>0){try{return orig(...a);}finally{G.depth--;}}
     const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);try{return orig(...a);}finally{gl.endQuery(ext.TIME_ELAPSED_EXT);G.pending.push(q);G.depth--;}};return true;},
 spin:(d)=>{setCamRotImmediate(yaw+d,pitch);markDirty(4);},
 n:()=>{try{return sparkRenderer.lodSplatCount??null;}catch(e){return null;}},
 splats:()=>{try{return window.__lodN??null;}catch(e){return null;}},
 pose:(p,y,pi)=>{camPos.set(p[0],p[1],p[2]);setCamRotImmediate(y,pi);markDirty(60);},
 q:(i)=>applyQualityTier(i,{source:'manual',immediate:true}),
 set:(o)=>{for(const [k,v] of Object.entries(o)){if(k==='cone')window.__cone=v;else sparkRenderer[k]=v;}sparkRenderer.lodDirty=true;markDirty(60);},
 sr:()=>window.__srDump?.(),
};window.__audit={
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
// 試験用: window.__cone={fov0,foveate} があれば中心の円錐を狭め、外側（画面の隅まで）の細かさを foveate 倍にする
const coneLine = "  const outer=Math.min(180,detail+30);";
if (!viewerHtml.includes(coneLine)) throw new Error('cone line not found');
viewerHtml = viewerHtml.replace(coneLine, coneLine + " if(window.__cone){sparkRenderer.coneFov0=window.__cone.fov0;sparkRenderer.coneFov=detail;sparkRenderer.coneFoveate=window.__cone.foveate;sparkRenderer.lodDirty=true;return;}");
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


const browser = await chromium.launch({channel: 'chrome', headless: false, args: ['--ignore-gpu-blocklist']});
const cfgs = arg('--cfg', 'base').split(',');
const out = [];
for (const s of scenes) for (const cfg of cfgs) {
  const page = await browser.newPage({viewport: {width: 1440, height: 810}});
  const logs = []; const T0 = Date.now(); page.on('console', m => { const t = m.text(); if (/Quality|calibration|Auto-quality/i.test(t)) logs.push(`${((Date.now() - T0) / 1000).toFixed(0)}s ${t.slice(0, 160)}`); });
  await page.goto(`http://127.0.0.1:${PORT}/viewer/offline-viewer.html?autoload=${encodeURIComponent('/api/viewer-stream/' + s.splat)}&protected=1&edge=${cfg}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 240000 && !(await page.evaluate(() => window.__edge?.ready()).catch(() => false))) await page.waitForTimeout(2000);
  await page.waitForTimeout(10000);
  const st = await page.evaluate(() => __audit.state());
  if (/^q[0-2]/.test(cfg)) await page.evaluate(([i]) => __edge.q(i), [Number(cfg[1])]);
  const SET = {b10: {lodSplatCount: 10e6}, b16: {lodSplatCount: 16e6}, r5: {lodSplatCount: 10e6, lodRenderScale: .5},
    fv2: {lodSplatCount: 10e6, cone: {fov0: 60, foveate: 2}}, fv3: {lodSplatCount: 10e6, cone: {fov0: 60, foveate: 3}},
    fv3b5: {lodSplatCount: 5e6, cone: {fov0: 60, foveate: 3}}, ref: {lodSplatCount: 16e6, lodRenderScale: .25}, q2p: {lodSplatCount: 10e6, lodRenderScale: .5}};
  if (cfg === 'q2p') await page.evaluate(() => __edge.q(2));
  if (SET[cfg]) await page.evaluate(([o]) => __edge.set(o), [SET[cfg]]);
  await page.evaluate(([p, y]) => __edge.pose(p, y, -0.05), [st.p, st.yaw]);
  await page.waitForTimeout(Number(arg('--settle', 20)) * 1000);
  const file = path.join(outDir, `${s.pid}_${s.idx}_${cfg}.png`);
  await page.screenshot({path: file});
  // 描画1回の GPU 時間（?gpuTime=1 で gl.finish 込み）。ゆっくり振り向きながら 4 秒測る。
  const hasTimer = await page.evaluate(() => __edge.gpuSetup());
  await page.evaluate(() => __edge.ft());
  for (let k = 0; k < 80; k++) { await page.evaluate(() => __edge.spin(0.01)); await page.waitForTimeout(50); }
  const fps = await page.evaluate(() => __edge.ft());
  const info = {pid: s.pid, idx: s.idx, cfg, fps, logs, qual: await page.evaluate(() => __edge.qi()).catch(() => null), splats: await page.evaluate(() => __edge.splats()), sr: await page.evaluate(() => __edge.sr()), file};
  console.log(JSON.stringify(info)); out.push(info);
  fs.writeFileSync(path.join(outDir, 'edge.json'), JSON.stringify(out, null, 1));
  await page.close();
}
await browser.close(); server.close();
