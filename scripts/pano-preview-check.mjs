// 物件ページの 360° プレビュー（src/components/pano-preview.tsx の WebGL 描画）を実ブラウザで確かめる（2026-11-23）。
//   本人「プレビューが機能していない」「360回転は？」。pano-preview.tsx からシェーダーをそのまま抜き出し、本番の /api/pano の 6 面で描いて
//   向き 0°・90°・180°・270°・上下 を撮る。0° はビューアーの最初の画像（同じシーンの f 面の中央）と同じ見え方になるはず。
//   node scripts/pano-preview-check.mjs <pano key(64桁)> [--webkit]
import { chromium, webkit } from 'file:///F:/Htlml/3DGS/locahun3d_online/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [key] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const WK = process.argv.includes('--webkit');
const src = fs.readFileSync('F:/Codex/viewerfix/src/components/pano-preview.tsx', 'utf8');
const VS = /const VS = "([^"]+)"/.exec(src)[1], FS = /const FS = `([\s\S]+?)`;/.exec(src)[1];
const OUT = 'F:/Codex/viewerfix/artifacts/pano-preview-check' + (WK ? '-webkit' : '');
fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><body style="margin:0;background:#fff"><canvas id=c style="width:960px;height:540px;display:block"></canvas><script>
const VS=${JSON.stringify(VS)}, FS=${JSON.stringify(FS)}, F=['f','r','b','l','u','d'];
window.go = async (key) => {
  const imgs = await Promise.all(F.map(f => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = '/api/pano/' + key + '-' + f + '.jpg'; })));
  const cv = document.getElementById('c'), gl = cv.getContext('webgl'); cv.width = 960; cv.height = 540;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(o); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p); gl.useProgram(p);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const l = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  imgs.forEach((img, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(gl.getUniformLocation(p, 't' + F[i]), i); });
  window.draw = (yaw, pitch) => { gl.viewport(0, 0, 960, 540); gl.uniform2f(gl.getUniformLocation(p, 'res'), 960, 540);
    gl.uniform1f(gl.getUniformLocation(p, 'fp'), 480 / Math.tan(100 * Math.PI / 360)); gl.uniform1f(gl.getUniformLocation(p, 'yaw'), yaw * Math.PI / 180);
    gl.uniform1f(gl.getUniformLocation(p, 'pitch'), pitch * Math.PI / 180); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  return 'ok';
};
</script>`;
const b = await (WK ? webkit : chromium).launch(WK ? { headless: false } : { channel: 'chrome', headless: false });
const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
await p.route('https://locahun3d.com/__pano-preview-check', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html }));
await p.goto('https://locahun3d.com/__pano-preview-check');
console.log(await p.evaluate((k) => window.go(k), key));
for (const [yaw, pitch] of [[0, 0], [45, 0], [90, 0], [180, 0], [270, 0], [0, 50], [0, -50]]) {
  await p.evaluate(([y, pt]) => window.draw(y, pt), [yaw, pitch]);
  await p.screenshot({ path: `${OUT}/yaw${yaw}_pitch${pitch}.jpg`, quality: 60 });
}
// 継ぎ目の確認: 面の境目（45°）で左右の色がつながっているか（境目の両側 2px の差の平均）
await p.evaluate(() => window.draw(45, 0));
const seam = await p.evaluate(() => { const c = document.getElementById('c'), t = document.createElement('canvas'); t.width = 960; t.height = 540; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
  const d = x.getImageData(476, 100, 8, 340).data; let s = 0, n = 0; for (let y = 0; y < 340; y++) { const a = (y * 8 + 1) * 4, b2 = (y * 8 + 6) * 4; s += Math.abs(d[a] - d[b2]) + Math.abs(d[a + 1] - d[b2 + 1]) + Math.abs(d[a + 2] - d[b2 + 2]); n++; } return (s / n / 3).toFixed(1); });
console.log('seam diff at 45deg (0-255, small = continuous):', seam);
await b.close();
console.log('→', OUT);
