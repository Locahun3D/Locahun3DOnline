// 歩行データ（当たり判定 whole）を自動生成→保存→開き直して残るかを実ブラウザで検証する（2026-10-07）。
// 本番には書かない。実スキャン(.splat)を読み、区画パス・イベント・傾いた立方体・初期視点・歩行の開始位置を置いてから回し、
//  1) 3D本体から見た相対位置・向きが変わらない（＝人が置いたものが回転についてくる）
//  2) 歩行の自動生成キャッシュ(whole 等)は捨てられ、開始位置は回る
//  3) 元に戻す(undo)で完全に戻る
//  4) ZIP に保存→開き直しても回転後の値が残る
// を確かめる。  node scripts/verify-scene-rotate.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const viewer = process.env.SCENE_EDITOR_HTML || path.resolve('public/viewer/scene-editor.html');
const scan = process.env.SCENE_EDIT_FIXTURE || 'F:/Codex/locahun-walk/fixtures/real-scan.splat';
const out = path.resolve('artifacts/walk-bake');
const DELTA = Number(process.env.ROTATE_DEG || 37.5);
await fs.mkdir(out, {recursive: true});
const original = await fs.readFile(scan);
let saved = null;

const hook = `
window.__walk={
 gen:async(opts)=>{const r=await generateWalkCollision(opts);return {r,status:walkSetup.status,whole:!!walkSetup.settings.whole,key:walkSetup.settings.whole?.key,bytes:walkSetup.settings.whole?.data?.length||0,spawn:walkSetup.settings.spawn,ready:!!walkSetup.core};},
};
window.__rot={
 main:()=>layers.find(L=>L.type==='splat'&&L.isMain)||layers.find(L=>L.type==='splat'),
 // 3D本体のローカル座標系で見た、人が置いたものの位置・向き
 rel:()=>{
  const M=__rot.main(); M.mesh.updateMatrixWorld(true);
  const inv=M.mesh.matrixWorld.clone().invert(), iq=M.mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
  const P=p=>{const v=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(inv);return [v.x,v.y,v.z];};
  const D=y=>{const v=new THREE.Vector3(Math.sin(y),0,Math.cos(y)).applyQuaternion(iq);return [v.x,v.y,v.z];};
  const out={layers:{},camera:{p:P(camPos),d:D(yaw),pitch},init:{p:P(_initCamPos),d:D(_initYaw),pitch:_initPitch}};
  for(const L of layers){ if(L===M||!L.mesh) continue; L.mesh.updateMatrixWorld(true);
   const q=iq.clone().multiply(L.mesh.getWorldQuaternion(new THREE.Quaternion()));
   const pts=(L.pathPoints||[]).map(p=>{const v=new THREE.Vector3(p.x,p.y,p.z);L.mesh.localToWorld(v);return P(v);});
   out.layers[L.id]={type:L.type,p:P(L.mesh.getWorldPosition(new THREE.Vector3())),q:[q.x,q.y,q.z,q.w],pts}; }
  const s=walkSetup.settings; if(s.spawn) out.spawn={p:P(s.spawn),d:D(s.spawnYaw)};
  return out;
 },
 raw:()=>({layers:layers.map(L=>({id:L.id,type:L.type,pos:{...L.pos},rot:{...L.rot}})),camPos:camPos.toArray(),yaw,initPos:_initCamPos.toArray(),initYaw:_initYaw,walk:JSON.parse(JSON.stringify(walkSetup.settings))}),
 setup:(shift)=>{
  if(shift){const M=__rot.main();M.pos={x:M.pos.x+shift[0],y:M.pos.y+shift[1],z:M.pos.z+shift[2]};M.rot={x:M.rot.x,y:M.rot.y+11,z:M.rot.z};applyLayerTransform(M.id);}
  const x=camPos.x,y=camPos.y-1,z=camPos.z-2;
  _pathPts=[new THREE.Vector3(x-1,y,z-1),new THREE.Vector3(x+1.5,y,z-1),new THREE.Vector3(x+1,y,z+1),new THREE.Vector3(x-1,y,z+1.2)];_finalizePath();
  const path=layers.findLast(L=>L.type==='path'); path.rot={x:0,y:15,z:0}; applyLayerTransform(path.id);
  addEventLayer(); const ev=layers.findLast(L=>L.type==='event'); ev.pos={x:x+2,y:y+0.5,z:z-3}; applyLayerTransform(ev.id);
  addCubeLayer(); const cube=layers.findLast(L=>L.type==='cube'); cube.pos={x:x-2,y:y,z:z+2}; cube.rot={x:20,y:-35,z:10}; applyLayerTransform(cube.id);
  _initCamPos.set(x+0.7,y+1.6,z+0.4); _initYaw=0.9; _initPitch=-0.2;
  walkSetup.settings.spawn={x:x+0.3,y:y,z:z-0.8}; walkSetup.settings.spawnYaw=-1.1;
  walkSetup.settings.whole={key:'a'.repeat(64),data:'AAAA'}; walkSetup.settings.navigation={key:'a'.repeat(64),data:'AAAA'};
  walkSetup.settings.boxes=[{center:[0,0,0],half:[1,1,1]}]; walkSetup.settings.signature='stale';
  return {path:path.id,event:ev.id,cube:cube.id};
 },
};
`;
let html = await fs.readFile(viewer, 'utf8');
const at = html.lastIndexOf('</script>');
assert.ok(at > 0);
html = html.slice(0, at) + hook + html.slice(at);
const shell = `<!doctype html><html lang="ja"><meta charset="utf-8"><style>body{margin:0}iframe{border:0;width:100%;height:100dvh}</style><iframe id="viewer" src="/viewer/scene-editor.html?onlineSceneEdit=1"></iframe><script>
let counter=0,mode='original',active='',saveRequest='';window.review={ready:false,saved:false,error:null};
const frame=document.getElementById('viewer');
window.addEventListener('message',async e=>{
 if(e.origin!==location.origin||e.source!==frame.contentWindow)return;const m=e.data;
 if(m.type==='locahun:scene-editor-ready'){active='load-'+(++counter);frame.contentWindow.postMessage({type:'locahun:scene-load',requestId:active,sourceUrl:'/api/scene-edit/source?sessionKey='+(mode==='original'?'a':'b').repeat(64),fileName:mode==='original'?'real-scan.splat':'edited-project.zip'},location.origin);}
 if(m.type==='locahun:scene-ready'&&m.requestId===active)review.ready=true;
 if(m.type==='locahun:scene-load-error'||m.type==='locahun:scene-export-error')review.error=m.code;
 if(m.type==='locahun:scene-exported'&&m.requestId===saveRequest){await fetch('/save',{method:'POST',body:m.archive});frame.contentWindow.postMessage({type:'locahun:scene-saved',requestId:saveRequest},location.origin);review.saved=true;}
});
window.doSave=()=>{saveRequest='save-'+(++counter);frame.contentWindow.postMessage({type:'locahun:scene-export',requestId:saveRequest},location.origin);};
window.reopen=()=>{mode='saved';review.ready=false;review.error=null;frame.src='/viewer/scene-editor.html?onlineSceneEdit=1&r='+(++counter);};
</script></html>`;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(shell); return; }
    if (u.pathname === '/viewer/scene-editor.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
    if (u.pathname === '/api/scene-edit/source') { const b = u.searchParams.get('sessionKey') === 'b'.repeat(64) ? saved : original; res.setHeader('Content-Type', 'application/octet-stream'); res.end(b); return; }
    if (u.pathname === '/save' && req.method === 'POST') { const c = []; for await (const x of req) c.push(x); saved = Buffer.concat(c); await fs.writeFile(path.join(out, 'rotated-project.zip'), saved); res.end('ok'); return; }
    if (u.pathname.startsWith('/viewer/')) {
      const file = path.resolve('public', '.' + u.pathname), root = path.resolve('public/viewer');
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'); res.end(await fs.readFile(file)); return;
    }
    res.writeHead(404); res.end();
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({channel: 'chrome', headless: false, args: ['--enable-webgl', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1440, height: 900}}), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept());
const ready = async () => { await page.waitForFunction(() => review.ready || review.error, null, {timeout: 180000}); assert.equal(await page.evaluate(() => review.error), null); };
const frameOf = () => page.frames().find(f => f.url().includes('/viewer/scene-editor.html'));
const close = (a, b, tol, what) => {
  if (Array.isArray(a)) { assert.equal(a.length, b.length, what); a.forEach((x, i) => close(x, b[i], tol, what + '[' + i + ']')); return; }
  if (a && typeof a === 'object') { for (const k of Object.keys(a)) close(a[k], b?.[k], tol, what + '.' + k); return; }
  if (typeof a === 'number') { assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`); return; }
  assert.equal(a, b, what);
};
// q と -q は同じ回転
const sameQ = (a, b, what) => { const dot = a.reduce((s, x, i) => s + x * b[i], 0); assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-9, `${what}: quaternion differs (|dot|=${Math.abs(dot)})`); };
const compareRel = (a, b, label) => {
  for (const id of Object.keys(a.layers)) {
    close(a.layers[id].p, b.layers[id].p, 1e-6, `${label} layer ${id} pos`);
    close(a.layers[id].pts, b.layers[id].pts, 1e-6, `${label} layer ${id} pathPoints`);
    if (a.layers[id].type !== 'event') sameQ(a.layers[id].q, b.layers[id].q, `${label} layer ${id} rot`);
  }
  for (const k of ['camera', 'init']) { close(a[k].p, b[k].p, 1e-6, `${label} ${k} pos`); close(a[k].d, b[k].d, 1e-6, `${label} ${k} dir`); close(a[k].pitch, b[k].pitch, 1e-12, `${label} ${k} pitch`); }
  close(a.spawn, b.spawn, 1e-6, `${label} walk spawn`);
};

const result = {};
try {
  await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil: 'domcontentloaded'}); await ready();
  let f = frameOf(); await f.locator('#dz').waitFor({state: 'hidden'});
  if (process.env.ROTATE_DEG) result.rotate = await f.evaluate(d => rotateSceneAboutY(d), Number(process.env.ROTATE_DEG));
  const t0 = Date.now();
  result.gen = await f.evaluate(() => __walk.gen());
  result.genSec = (Date.now() - t0) / 1000;
  console.log('generated', JSON.stringify(result.gen), result.genSec + 's');
  assert.ok(result.gen.whole, 'whole collision generated');
  await page.evaluate(() => doSave()); await page.waitForFunction(() => review.saved || review.error, null, {timeout: 300000});
  assert.equal(await page.evaluate(() => review.error), null);
  await page.evaluate(() => reopen()); await ready(); f = frameOf(); await f.locator('#dz').waitFor({state: 'hidden'});
  const t1 = Date.now();
  result.reopen = await f.evaluate(() => __walk.gen({automatic: true}));
  result.reopenSec = (Date.now() - t1) / 1000;
  assert.equal(result.reopen.key, result.gen.key, 'saved whole key reused after reopen');
  assert.ok(result.reopen.ready, 'walk collision ready without rebake');
  await page.screenshot({path: path.join(out, 'reopened.png')});
  assert.deepEqual(errors, [], 'no runtime errors');
  result.pass = true; await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log('PASS walk bake', JSON.stringify({genSec: result.genSec, reopenSec: result.reopenSec, bytes: result.gen.bytes}));
} catch (e) { await page.screenshot({path: path.join(out, 'failure.png')}).catch(() => {}); console.error('Browser errors', errors, JSON.stringify(result)); throw e; }
finally { await browser.close(); await new Promise(r => server.close(r)); }
