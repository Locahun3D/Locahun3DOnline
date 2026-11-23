// 写真ツアー（2D 表示）と 3D に切り替わった後で、いろいろな操作をして変な動きが無いかを実ブラウザで確かめる（2026-11-23）。
//   本人「いろんな操作しておかしな挙動ないか確認」。開き方は物件ページと同じ（署名付き autoload＋streamref。gate-flow.mjs と同じ）。
//   見ること（毎コマ）: 写真の箱からカメラが出ていない（灰色の背景が見えない）・移動が止まったままにならない・ページのエラーが無い・
//   キーを離したあと勝手に動き続けない・3D に切り替わった後 WASD で歩ける。
//   node scripts/tour-interact.mjs [--local] [--webkit] [--mobile] [zip名...]
import { chromium, webkit, devices } from 'file:///F:/Htlml/3DGS/locahun3d_online/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const LOCAL = args.includes('--local'), WK = args.includes('--webkit'), IPAD = args.includes('--ipad'), MOBILE = args.includes('--mobile') || IPAD;   // --ipad: iPad（タッチ＋キーボードも試す）
let zips = args.filter((a) => !a.startsWith('--'));
// --prop=slug1,slug2: 物件ページを開き、そこにあるビューアーのリンクをそのまま開く（利用者と同じ経路。2026-11-23）
const PROPS = (args.find((a) => a.startsWith('--prop=')) || '').slice(7).split(',').filter(Boolean);
const LINKS = new Map();
const ROOT = 'F:/Codex/viewerfix/public', SIGNED = 'https://signed-r2.invalid/';
const OUT = 'F:/Codex/viewerfix/artifacts/tour-interact/' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + (WK ? '-webkit' : '') + (IPAD ? '-ipad' : MOBILE ? '-mobile' : '') + (LOCAL ? '-local' : '-prod');
fs.mkdirSync(OUT, { recursive: true });
const browser = await (WK ? webkit : chromium).launch(WK ? { headless: false } : { channel: 'chrome', headless: false, args: ['--window-size=1300,800'] });
const ctxOpt = IPAD ? { ...devices['iPad Pro 11'] } : MOBILE ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 720 } };
if (MOBILE && !WK) delete ctxOpt.defaultBrowserType;

// ページ内の見張り: 写真が出ている間、毎コマ「箱の中心とカメラの距離」「移動中の時間」を記録
const WATCH = () => {
  const S = window.__startPano, T = S.tour, w = window.__tiw = { maxOff: 0, offFrames: 0, busyMax: 0, busySince: 0, frames: 0, on: true, camMoves: 0, lastCam: null };
  const sc = () => window.__dbg && window.__dbg.scene, cam = () => window.__dbg && window.__dbg.camera;
  (function f() {
    if (!w.on) return; w.frames++;
    const c = cam(), s = sc();
    if (c && s && (T.pre || T.lite) && S.state === 'shown') {
      // 描く瞬間の「箱の中心とカメラの距離」を測る（描画の直前の処理の後に差し込む）
      for (const o of s.children) if (o.isGroup && o.children.length === 6 && o.children[0].children[0]?.material?.map) {
        const m = o.children[0].children[0]; if (m.__tiw) continue; m.__tiw = 1; const orig = m.onBeforeRender;
        m.onBeforeRender = function (r, sc2, cam, ...rest) { orig && orig.call(this, r, sc2, cam, ...rest); if (!(T.pre || T.lite) || S.state !== 'shown') return;
          const d = o.position.distanceTo(cam.position); w.maxOff = Math.max(w.maxOff, d); if (d > 0.62) w.offFrames++; }; }
    }
    if (c) { const p = c.position; if (w.lastCam && Math.hypot(p.x - w.lastCam[0], p.z - w.lastCam[1]) > 1e-3) w.camMoves++; w.lastCam = [p.x, p.z]; }
    const now = performance.now();
    if (T.busy) { w.busySince ||= now; w.busyMax = Math.max(w.busyMax, now - w.busySince); } else w.busySince = 0;
    requestAnimationFrame(f);
  })();
};
const state = (p) => p.evaluate(() => { const S = window.__startPano, T = S && S.tour; const c = window.__dbg && window.__dbg.camera;
  return S ? { state: S.state, why: S.why, liteWhy: S.lite || null, tstate: T && T.state ? { n: T.state.n, fps: T.state.fps && +T.state.fps.toFixed(1), kbps: T.state.kbps, quiet: T.state.quiet } : null, pre: T && T.pre, lite: T && T.lite, bridge: T && T.bridge, cur: T && T.cur, busy: T && T.busy, n: S.points ? S.points.length : 0,
    cam: c ? [+c.position.x.toFixed(2), +c.position.y.toFixed(2), +c.position.z.toFixed(2)] : null, w: window.__tiw ? { ...window.__tiw, lastCam: undefined } : null } : null; }).catch((e) => ({ err: String(e).slice(0, 80) }));

if (PROPS.length) {
  const c0 = await browser.newContext(ctxOpt), p0 = await c0.newPage();
  for (const slug of PROPS) {
    await p0.goto('https://locahun3d.com/properties/' + slug, { waitUntil: 'domcontentloaded', timeout: 90000 }); await p0.waitForTimeout(2500);
    const hrefs = await p0.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/viewer/offline-viewer"]')].map((a) => a.href))]);
    for (const h of hrefs) { const z = decodeURIComponent(new URL(h).searchParams.get('autoload') || '').split('/').pop(); zips.push(z); LINKS.set(z, h); }
  }
  await c0.close();
  console.log('物件ページのリンク ' + zips.length + ' 件');
}
const results = [];
for (const zip of zips) {
  const ctx = await browser.newContext(ctxOpt);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|net::|Failed to load resource/i.test(m.text())) errs.push('console ' + m.text().slice(0, 140)); });
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
  if (LINKS.has(zip)) await p.goto(LINKS.get(zip), { timeout: 120000, waitUntil: 'commit' }); else
  await p.goto('https://locahun3d.com/viewer/offline-viewer?autoload=' + encodeURIComponent(SIGNED + key) + '&protected=1&streamref=' + encodeURIComponent('/api/viewer-stream/' + key + '?ref=stream'), { timeout: 120000, waitUntil: 'commit' });
  let st = null;
  for (let i = 0; i < 160; i++) { st = await state(p); if (st && st.state === 'shown' && st.n > 0) break; if (st && /none|error/.test(st.state || '')) break; await p.waitForTimeout(250); }
  const steps = []; const shot = async (tag) => p.screenshot({ path: `${OUT}/${zip.slice(0, 10)}_${tag}.jpg`, quality: 50 });
  const log = async (name, extra = {}) => { const s = await state(p); steps.push({ name, ...extra, off: s?.w?.offFrames, maxOff: s?.w ? +s.w.maxOff.toFixed(2) : null, cur: s?.cur, pre: s?.pre, lite: s?.lite, liteWhy: s?.liteWhy, ts: s?.tstate, busy: s?.busy, cam: s?.cam, state: s?.state }); return s; };
  if (!(st && st.state === 'shown')) { results.push({ zip, ok: false, why: 'no 2D ' + JSON.stringify(st), errs }); console.log('[NG] ' + zip + ' 2D が出ない ' + JSON.stringify(st)); await ctx.close(); continue; }
  await p.evaluate(WATCH);
  await p.waitForTimeout(600); await shot('0start');
  const vp = p.viewportSize(), cx = Math.round(vp.width / 2), cy = Math.round(vp.height / 2);
  const inPhoto = async () => { const s = await state(p); return s && (s.pre || s.lite) && s.state === 'shown'; };
  // 1. ドラッグで見回す
  // タッチのスワイプ（iPhone・iPad）: ページの中で touch / pointer の events を順に出す（Playwright の touchscreen は tap だけ）
  const swipe = async (x0, y0, x1, y1, n = 12) => p.evaluate(async ([x0, y0, x1, y1, n]) => {
    const el = document.elementFromPoint(x0, y0) || document.body;
    const mk = (x, y) => { try { return new Touch({ identifier: 7, target: el, clientX: x, clientY: y, pageX: x, pageY: y }); } catch (_) { return null; } };
    const fire = (type, x, y) => { const t = mk(x, y);
      el.dispatchEvent(new PointerEvent(type === 'touchstart' ? 'pointerdown' : type === 'touchend' ? 'pointerup' : 'pointermove', { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true, buttons: type === 'touchend' ? 0 : 1 }));
      if (t) el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); };
    fire('touchstart', x0, y0);
    for (let k = 1; k <= n; k++) { await new Promise((r) => setTimeout(r, 16)); fire('touchmove', x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); }
    fire('touchend', x1, y1);
  }, [x0, y0, x1, y1, n]);
  if (MOBILE) {
    await swipe(cx - 80, cy, cx + 80, cy); await p.waitForTimeout(400);
    await swipe(cx + 60, cy - 40, cx - 60, cy + 30); await p.waitForTimeout(400);
  } else { await p.mouse.move(cx, cy); await p.mouse.down(); for (let k = 1; k <= 12; k++) await p.mouse.move(cx + k * 25, cy + k * 3); await p.mouse.up(); }
  await log('drag');
  if ((!MOBILE || IPAD) && await inPhoto()) {
    // 2. W を押し続ける → 離したら止まる
    const c0 = (await state(p)).cur; await p.keyboard.down('w'); await p.waitForTimeout(2200); await p.keyboard.up('w');
    const s1 = await log('hold W 2.2s', { from: c0 }); await p.waitForTimeout(1500); const s2 = await log('after release 1.5s');
    steps.at(-1).keptMoving = s1.cur !== s2.cur && !s1.busy;
    await shot('1afterW');
    // 3. S / A / D / 矢印 を 1 回ずつ
    for (const k of ['s', 'a', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown']) { const b = (await state(p)).cur; await p.keyboard.press(k); await p.waitForTimeout(1000); await log('press ' + k, { from: b }); }
    // 4. 連打（移動中にキー）
    for (let k = 0; k < 6; k++) { await p.keyboard.press(k % 2 ? 'd' : 'w'); await p.waitForTimeout(120); }
    await p.waitForTimeout(1500); await log('mash W/D');
    // 5. 同時押し W+D
    await p.keyboard.down('w'); await p.keyboard.down('d'); await p.waitForTimeout(1200); await p.keyboard.up('d'); await p.keyboard.up('w'); await p.waitForTimeout(1200); await log('W+D together');
    // 6. ホイール（ズーム）・ダブルクリック・Esc・Shift/Space/Q/E（3D 用のキー）
    if (!MOBILE) { await p.mouse.move(cx, cy); await p.mouse.wheel(0, -400); await p.waitForTimeout(500); await p.mouse.wheel(0, 400); await p.waitForTimeout(500); await log("wheel"); }
    for (const k of ['Shift', 'Space', 'q', 'e', 'Escape']) { await p.keyboard.press(k); await p.waitForTimeout(400); }
    await log('other keys');
    await shot('2keys');
  }
  // 7. 床の丸をクリック（見えているもの）
  if (await inPhoto()) {
    const spot = await p.evaluate(() => { const b = [...document.querySelectorAll('.sp-spot')].find((e) => e.style.display === 'block'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    if (spot) { const b = (await state(p)).cur; if (MOBILE) await p.touchscreen.tap(spot[0], spot[1]); else await p.mouse.click(spot[0], spot[1]); await p.waitForTimeout(1500); await log('click spot', { from: b }); }
    // 8. 床をタップ（画面下の真ん中）
    { const b = (await state(p)).cur; if (MOBILE) await p.touchscreen.tap(cx, cy + 150); else await p.mouse.click(cx, cy + 200); await p.waitForTimeout(1500); await log('tap floor', { from: b }); }
    if (MOBILE) for (let k = 0; k < 3; k++) { const b = (await state(p)).cur; await p.touchscreen.tap(cx + (k - 1) * 60, cy + 120); await p.waitForTimeout(1300); await log('tap floor ' + k, { from: b }); }
    if (MOBILE) { await p.touchscreen.tap(cx, cy); await p.waitForTimeout(80); await p.touchscreen.tap(cx, cy); await p.waitForTimeout(1200); await log('double tap'); await swipe(cx, cy + 100, cx, cy - 100); await p.waitForTimeout(600); await log('swipe up'); }
    await shot('3tap');
  }
  // 9. 3D に切り替わるまで待つ（最大 90 秒）→ WASD で歩けるか
  const t3 = Date.now(); let s3 = await state(p);
  while (Date.now() - t3 < 90000 && s3 && (s3.pre || s3.lite === undefined) && s3.state === 'shown') { await p.waitForTimeout(1000); s3 = await state(p); }
  await p.waitForTimeout(2500);
  s3 = await log('3D wait', { sec: Math.round((Date.now() - t3) / 1000) });
  let walk3d = null;
  if ((!MOBILE || IPAD) && s3 && !s3.lite && s3.state !== 'shown') {
    const a = (await state(p)).cam; await p.keyboard.down('w'); await p.waitForTimeout(1200); await p.keyboard.up('w'); await p.waitForTimeout(800);
    const b = (await state(p)).cam; await p.keyboard.down('s'); await p.waitForTimeout(600); await p.keyboard.up('s'); await p.waitForTimeout(600);
    const c = (await state(p)).cam;
    walk3d = { fw: a && b ? +Math.hypot(b[0] - a[0], b[2] - a[2]).toFixed(2) : null, back: b && c ? +Math.hypot(c[0] - b[0], c[2] - b[2]).toFixed(2) : null };
    await log('3D W/S', walk3d); await shot('4in3d');
  }
  const w = (await state(p))?.w || {};
  const moves = steps.filter((s) => s.from !== undefined && s.cur !== s.from).length;
  const kept = steps.some((s) => s.keptMoving);
  const ok = !errs.length && (w.offFrames || 0) === 0 && (w.busyMax || 0) < 8000 && !kept && (MOBILE && !IPAD ? moves >= 1 : moves >= 3) && (!walk3d || walk3d.fw > 0.2 || walk3d.back > 0.2);
  const r = { zip, ok, moves, maxOff: +(w.maxOff || 0).toFixed(2), offFrames: w.offFrames, busyMax: Math.round(w.busyMax || 0), kept, walk3d, errs, steps };
  results.push(r);
  console.log((ok ? '[OK] ' : '[NG] ') + zip + ` 移動${moves}回 箱の外${w.offFrames || 0}コマ(最大${r.maxOff}) 移動中最長${r.busyMax}ms 離した後も動く=${kept} 3D歩行=${JSON.stringify(walk3d)} エラー${errs.length}` + (errs[0] ? ' ' + errs[0] : ''));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT + '/result.json', JSON.stringify(results, null, 1));
const ng = results.filter((r) => !r.ok).length;
console.log(`問題あり ${ng}/${results.length} → ${OUT}`);
process.exit(ng ? 1 : 0);
