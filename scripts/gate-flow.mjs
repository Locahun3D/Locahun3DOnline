// 物件ページから開いたのと同じ形でビューアーを開き、最初の 360° 画像（2D）と写真ツアーが本当に出るかを実ブラウザで確かめる（2026-11-23）。
//   本人「最初2D表示するの機能してない」「実機でデバッグと機能確認 全部」。
//   物件ページ・共有・埋め込みは autoload に署名付きの R2 URL（別オリジン）＋ ?streamref=/api/viewer-stream/<key>?ref=stream を渡す。
//   tour-audit.mjs は /api/viewer-stream を直接開くので、この形の不具合を拾えなかった。ビューアーの開始画像・ツアーを触ったら必ずこれも回す。
//
//   node scripts/gate-flow.mjs [--local] [--webkit] [--mobile] [--n=8] [zip名...]
//     --local   /viewer/* を手元の public/viewer に差し替える（push 前の確認）。無しなら本番そのもの
//     --webkit  WebKit（iPhone の Safari 相当）。--mobile で iPhone の画面サイズ・タッチ
//     zip名を省くと、写真ツアーのある公開シーンから --n 件
import { chromium, webkit, devices } from 'file:///F:/Htlml/3DGS/locahun3d_online/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const LOCAL = args.includes('--local'), WK = args.includes('--webkit'), MOBILE = args.includes('--mobile');
const N = Number((args.find((a) => a.startsWith('--n=')) || '--n=8').slice(4));
let zips = args.filter((a) => !a.startsWith('--'));
const ROOT = 'F:/Codex/viewerfix/public';
const OUT = 'F:/Codex/viewerfix/artifacts/gate-flow/' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + (WK ? '-webkit' : '') + (MOBILE ? '-mobile' : '') + (LOCAL ? '-local' : '-prod');
fs.mkdirSync(OUT, { recursive: true });
const SIGNED = 'https://signed-r2.invalid/';   // 署名付き URL の代わり（別オリジン。中身は本番の /api/viewer-stream から取る）

if (!zips.length) {
  const log = fs.readFileSync('F:/Codex/pvgen/tour/graph_published.log', 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const all = [...log.matchAll(/^\[fixed\] \S+ (.+?\.zip) [0-9a-f]{12}$/gm)].map((m) => m[1]);
  const step = Math.max(1, Math.floor(all.length / N));
  zips = all.filter((_, i) => i % step === 0).slice(0, N);
}

const browser = await (WK ? webkit : chromium).launch(WK ? { headless: false } : { channel: 'chrome', headless: false, args: ['--window-size=1300,800'] });
const ctxOpt = MOBILE ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 720 } };
if (MOBILE && !WK) delete ctxOpt.defaultBrowserType;
const results = [];
for (const zip of zips) {
  const ctx = await browser.newContext(ctxOpt);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  if (LOCAL) await ctx.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/viewer/'), async (r) => {
    let f = ROOT + decodeURIComponent(new URL(r.request().url()).pathname);
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.continue();
    const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : /\.m?js$/.test(f) ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return r.fulfill({ status: 200, headers: { 'content-type': ct }, body: fs.readFileSync(f) });
  });
  await ctx.route((u) => u.href.startsWith(SIGNED), async (r) => {
    const key = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    const h = { ...r.request().headers() }; delete h.origin; delete h.referer;
    const res = await r.fetch({ url: 'https://locahun3d.com/api/viewer-stream/' + key, headers: h });
    return r.fulfill({ response: res, headers: { ...res.headers(), 'access-control-allow-origin': '*', 'access-control-expose-headers': 'etag, content-length, content-range' } });
  });
  const key = 'assets/splat/' + zip;
  const url = 'https://locahun3d.com/viewer/offline-viewer?autoload=' + encodeURIComponent(SIGNED + key) + '&protected=1&streamref=' + encodeURIComponent('/api/viewer-stream/' + key + '?ref=stream');
  const T0 = Date.now(); let poster = null, shown = null, st = null;
  await p.goto(url, { timeout: 120000, waitUntil: 'commit' }).catch((e) => errs.push('goto ' + e.message.slice(0, 80)));
  for (let i = 0; i < 160; i++) {
    st = await p.evaluate(() => { const s = window.__startPano; return { poster: !!document.getElementById('sp-poster'), state: s && s.state, why: s && s.why, key: s && s.key, graph: s && !!s.graph, n: s && s.points ? s.points.length : 0, cur: s && s.tour && s.tour.cur }; }).catch(() => null);
    const t = (Date.now() - T0) / 1000;
    if (st && st.poster && poster === null) { poster = t; await p.screenshot({ path: `${OUT}/${zip.slice(0, 10)}_a_poster.jpg`, quality: 55 }); }
    if (st && st.state === 'shown' && shown === null) shown = t;
    if (st && (st.state === 'none' || st.state === 'error')) break;
    if (shown !== null && st.cur) break;
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/${zip.slice(0, 10)}_b_start.jpg`, quality: 55 });
  // 進む矢印が重なっていないか（ボタン 40px の中心どうしが 38px 未満なら押し分けられない）
  const overlap = await p.evaluate(() => { const r = [...document.querySelectorAll('.sp-arrow')].filter((e) => e.style.display !== 'none').map((e) => e.getBoundingClientRect());
    let n = 0; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y) < 38) n++; return { arrows: r.length, overlap: n }; }).catch(() => ({ arrows: 0, overlap: -1 }));
  // ツアーで 1 地点移れるか（画像が読めるか）
  let moved = null;
  if (st && st.n > 0) {
    moved = await p.evaluate(async () => { const s = window.__startPano, T = s.tour; const b = T.cur; const nb = (s.startNode && s.startNode.nb && s.startNode.nb[0]) || s.points[0].id;
      try { await T.go(nb); } catch (e) { return 'err ' + e; } await new Promise((r) => setTimeout(r, 1500)); return T.cur !== b ? 'ok' : 'stuck'; }).catch((e) => 'err ' + String(e).slice(0, 60));
    await p.screenshot({ path: `${OUT}/${zip.slice(0, 10)}_c_moved.jpg`, quality: 55 });
  }
  const first = [poster, shown].filter((v) => v !== null).sort((a, b) => a - b)[0] ?? null;   // 3D 側の画像が先に出れば 2D の下絵は作られない（それでよい）
  const ok = first !== null && first <= 8 && shown !== null && (st.n === 0 || moved === 'ok') && overlap.overlap === 0 && !errs.length;
  const r = { zip, ok, first, poster, shown, state: st && st.state, why: st && st.why, graph: st && st.graph, points: st && st.n, moved, ...overlap, errs };
  results.push(r);
  console.log((ok ? '[OK] ' : '[NG] ') + zip + ` 最初の画像=${first ?? '-'}s(2D下絵 ${poster ?? '-'} / 360 ${shown ?? '-'}) state=${r.state}${r.why ? '(' + r.why + ')' : ''} 地点=${r.points} 移動=${moved ?? '-'} 矢印=${overlap.arrows}(重なり${overlap.overlap})` + (errs.length ? ' errs=' + errs.join(' / ') : ''));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT + '/result.json', JSON.stringify(results, null, 1));
const ng = results.filter((r) => !r.ok).length;
console.log(`問題あり ${ng}/${results.length} → ${OUT}`);
process.exit(ng ? 1 : 0);
