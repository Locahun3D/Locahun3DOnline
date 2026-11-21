// 360° 写真ツアー（動線グラフ）の監視（2026-11-21 本人「動線を割り出す仕組みやAI監視を仕組みにする必要がある」）。
// 本番のページを実ブラウザ（headed）で軽量表示（?lite=1）にして開き、シーンごとに:
//   1. <key>.graph.json があるか・中の監視の数字（bake-pano --graph が書く audit / review）が基準を満たすか
//   2. ビューアーが読んだつながりで、開始位置から全地点へ行けるか
//   3. つながりをたどって実際に 15 回移り、毎回その地点の画像が出るか（画像の 4xx・ページのエラーが無いか）
// を確かめ、artifacts/tour-audit/<日時>.json と一覧（.md）に残す。問題のあるシーンは作り直しの一覧（rebake.txt）にも出す。
//   node scripts/tour-audit.mjs --all | --property <slug,..> | --scene <autoload,..>  [--viewer <html>（手元のビューアーを差し込む）] [--moves 15]
// 登録の工程（r2_register.py）は bake-pano --graph の後にこれを 1 シーンだけ回し、定期の見回りは --all で回す。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://locahun3d.com';
const MOVES = Number(arg('--moves', 15));
const VIEWER = arg('--viewer', '');
const OUT = path.resolve(ROOT, arg('--out', 'artifacts/tour-audit'));
fs.mkdirSync(OUT, { recursive: true });

// 基準（どれかに当たったら「問題あり」）
export const RULES = [
  ['graph', (a) => !a.graph, '動線グラフが無い（bake-pano --graph で作る）'],
  ['area', (a) => a.graph && a.audit.area < 15, '歩ける床が狭すぎる（当たり判定が細切れの疑い）'],
  ['coverage', (a) => a.graph && a.audit.coverage < 0.9, '地点から遠い床が 1 割を超える'],
  ['components', (a) => a.graph && a.audit.components > 1, 'つながりが途切れている'],
  ['gap', (a) => a.graph && a.audit.maxGap > a.audit.S * 2 + 0.5, '地点の間が空きすぎる所がある'],
  ['dropped', (a) => a.graph && a.audit.dropped / Math.max(1, a.audit.nodes + a.audit.dropped) > 0.3, '壊れた地点が 3 割を超える（スキャンの質）'],
  ['ai', (a) => a.graph && (!a.review || a.review.error), 'AI の監視が済んでいない'],
  ['missing', (a) => a.graph && (a.review?.missing || []).length > 0, '写真に写った先に地点が無い（AI の指摘）'],
  ['reach', (a) => a.graph && a.reach && a.reach.reached < a.reach.total, 'ビューアーで開始位置から行けない地点がある'],
  ['move', (a) => a.graph && a.walk && (a.walk.ok < a.walk.tried || a.bad.length), '移動できない・画像が出ない'],
  ['error', (a) => a.errors.length > 0, 'ページのエラー'],
];

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
    for (const slug of [...new Set([...html.matchAll(/href="\/properties\/([^"/?#]+)"/g)].map((m) => m[1]))]) out.push(...await propertyScenes(slug));
  } else { console.error('--all / --property <slug> / --scene <autoload>'); process.exit(2); }
  return out.filter((s) => s.scene.startsWith('/api/viewer-stream/'));
}

async function auditScene(browser, s) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const a = { scene: s.scene, property: s.property, at: new Date().toISOString(), errors: [], bad: [] };
  page.on('pageerror', (e) => a.errors.push(String(e).slice(0, 160)));
  page.on('response', (r) => { if (r.status() >= 400 && /\/api\/pano\/[0-9a-f]{64}-/.test(r.url())) a.bad.push(r.status() + ' ' + r.url().split('/').pop().slice(64)); });
  if (VIEWER) await page.route((u) => u.host === 'locahun3d.com' && u.pathname.startsWith('/viewer/'), async (route) => {
    const f = path.join(path.dirname(path.resolve(VIEWER)), decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/viewer\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.continue();
    const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : /\.m?js$/.test(f) ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ status: 200, headers: { 'content-type': ct }, body: fs.readFileSync(f) });
  });
  try {
    await page.goto(`${ORIGIN}/viewer/offline-viewer.html?autoload=${encodeURIComponent(s.scene)}&protected=1&lite=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    let st = null;
    for (let i = 0; i < 120; i++) {
      st = await page.evaluate(() => { const s = window.__startPano; return s && { state: s.state, key: s.key, graph: s.graph || null, lite: !!s.tour?.lite }; }).catch(() => null);
      if (st && (st.lite || st.state === 'none')) break;
      await page.waitForTimeout(500);
    }
    a.key = st?.key || null; a.state = st?.state;
    a.graph = !!st?.graph;
    if (a.graph) {
      const gj = await page.evaluate(async (k) => (await fetch('/api/pano/' + k + '.graph.json', { cache: 'no-cache' })).json(), a.key);
      a.audit = gj.audit || {}; a.review = gj.review || null; a.set = gj.set;
      a.reach = await page.evaluate(() => { const s = window.__startPano, seen = new Set(['start']), q = ['start'];
        const by = (id) => id === 'start' ? s.startNode : s.points.find((x) => x.id === id);
        while (q.length) { const c = by(q.shift()); for (const id of c?.nb || []) if (!seen.has(id)) { seen.add(id); q.push(id); } }
        return { reached: seen.size - 1, total: s.points.length }; });
      a.walk = await page.evaluate(async (moves) => { const s = window.__startPano, T = s.tour; let ok = 0, tried = 0; const fail = [];
        for (let k = 0; k < moves; k++) { const c = T.cur === 'start' ? s.startNode : s.points.find((x) => x.id === T.cur); const nb = (c?.nb || []).filter((id) => id !== 'start');
          if (!nb.length) { fail.push('dead:' + T.cur); break; }
          const id = nb[Math.floor(Math.random() * nb.length)]; tried++;
          for (let w = 0; w < 200 && T.busy; w++) await new Promise((r) => setTimeout(r, 50));
          await T.go(id); if (T.cur === id) ok++; else fail.push(id); }
        return { ok, tried, fail: fail.slice(0, 5) }; }, MOVES);
    }
  } catch (e) { a.errors.push('audit: ' + String(e?.message || e).slice(0, 160)); }
  finally { await ctx.close(); }
  a.issues = RULES.filter(([, f]) => { try { return f(a); } catch { return false; } }).map(([k, , msg]) => ({ k, msg }));
  return a;
}

const scenes = await listScenes();
console.log(`監視 ${scenes.length} シーン`);
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const results = [];
for (const s of scenes) {
  const a = await auditScene(browser, s);
  results.push(a);
  const tag = a.issues.length ? `\x1b[31m[NG ${a.issues.map((i) => i.k).join(',')}]\x1b[0m` : '\x1b[32m[OK]\x1b[0m';
  console.log(`${tag} ${s.property || ''} ${s.scene.split('/').pop()}${a.graph ? ` 地点${a.audit.nodes} 床${a.audit.area}㎡ 届く${a.reach?.reached}/${a.reach?.total} 移動${a.walk?.ok}/${a.walk?.tried}` : ''}`);
}
await browser.close();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(path.join(OUT, `${stamp}.json`), JSON.stringify(results, null, 1));
const ng = results.filter((a) => a.issues.length);
const md = [`# 360° ツアー監視 ${stamp}`, '', `${results.length} シーン中 問題あり ${ng.length}`, '',
  ...ng.map((a) => `- ${a.property || ''} \`${a.scene.split('/').pop()}\`: ${a.issues.map((i) => i.msg).join(' / ')}`)].join('\n');
fs.writeFileSync(path.join(OUT, `${stamp}.md`), md + '\n');
fs.writeFileSync(path.join(OUT, 'rebake.txt'), ng.filter((a) => a.issues.some((i) => ['graph', 'components', 'reach', 'move', 'ai'].includes(i.k))).map((a) => a.scene).join(',') + '\n');
console.log(`問題あり ${ng.length}/${results.length} → ${path.join(OUT, stamp + '.md')}`);
process.exit(ng.length ? 1 : 0);
