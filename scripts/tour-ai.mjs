// 軽量表示の 360° 写真ツアー: 地点の候補を選び、AI に「写りが良いか・足りない所はどこか・揃ったか」を判定させる（2026-11-20 本人
// 「撮影する地点に改善の余地がある」「AIで物件ごとに都度必要なところと完成をチェックと画像がいいか判断する仕組み」「新しい物件にも自動ワークフローで」）。
// scripts/bake-pano.mjs --points から使う（登録の工程 r2_register.py → bake-pano.mjs --points --fix で新しいシーンにも自動で効く）。
//
// 1. 候補（PAGE_CANDS、ビューアーの中で動く）: 床の当たり判定から歩ける升を全部拾い（開始位置から 40m まで）、各升の「壁までの距離（16 方向）」を測る。
//    壁際・家具の隙間より、部屋の真ん中で見通しの良い所を優先し、2.5m 以上離して選ぶ。向きは一番ひらけた方向。
//    数は広さで決める（limits()）: 候補 = 歩ける床 12㎡ に 1 か所（6〜40）、使う地点の上限 = 25㎡ に 1 か所（4〜24、ビューアーの上限 24）、足りない所の指摘 = 60㎡ に 1 か所（3〜10）。
//    （以前の pickPoints は「開始位置から一番遠い所」から選ぶので壁際・撮影範囲の端に寄り、向きも全地点が開始位置と同じだった）
// 2. 撮る（bake-pano.mjs）→ 3. AI（ローカルの claude -p）が各地点の 360° 帯画像と平面の配置図を見て判定:
//    使う/使わない（ぼやけ・撮影範囲の外・壁しか見えない・家具の中・似た画の重複）、歩く順、足りない場所（どの地点から・どちら・何 m）、揃ったか。
//    足りない場所は撮り足して、もう一度だけ判定する。判定は points.json の review に残す（未判定のシーンは bake-pano が missing-review と出す）。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

// ── ビューアーの中で動く候補選び（walkSetup.core = 当たり判定、_walkWholeCoverage = 撮影範囲） ──
export const PAGE_CANDS = `;window.__pbCands=(o)=>{
  const core = typeof walkSetup !== 'undefined' && walkSetup.core;
  if(!core) return { error: 'no collision' };
  const s = o.pos, R = o.radius || 40, cell = 0.5, gap = o.gap || 2.5, reach = o.reach || 10, RAY = 6, ND = 16, B = 8;
  const DOWN = { x: 0, y: -1, z: 0 }, UP = { x: 0, y: 1, z: 0 };
  const hitAt = (q, d, L) => { const h = core.raycast(q, d, L); return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  // 当たり判定は全体（walkSetup.wholeIndex）から「いま調べる範囲の升」だけを読み込んで使う（読み込んだ範囲の外は何も無い扱いになる）。
  // そこで 8m 四方ずつ、周り（光線の長さ分）も含めて読み込んでから調べる。全体が無い（事前作成の判定が無い）時は今ある範囲だけ
  const W = walkSetup.wholeIndex;
  const cov = (x0, z0, x1, z1, y0, y1) => { if(!W) return true; try { core.setTileCoverage(W, { min: [x0, y0, z0], max: [x1, y1, z1] }); return true; } catch(e) { return false; } };
  const covSeg = (a, b) => cov(Math.min(a.x, b.x) - 1, Math.min(a.z, b.z) - 1, Math.max(a.x, b.x) + 1, Math.max(a.z, b.z) + 1, Math.min(a.y, b.y) - 1, Math.max(a.y, b.y) + 1);
  cov(s.x - 3, s.z - 3, s.x + 3, s.z + 3, s.y - 6, s.y + 2);
  const fl = [];
  for(let i = -2; i <= 2; i++) for(let j = -2; j <= 2; j++){ const h = hitAt({ x: s.x + i * cell, y: s.y, z: s.z + j * cell }, DOWN, 4); if(h !== null) fl.push(s.y - h); }
  // 開始位置が高い（屋外の見下ろし）・真下が抜けている時は、広く深く探す（経堂西通り・有明で 'no floor near start'。2026-11-21）
  if(fl.length < 3){ cov(s.x - 8, s.z - 8, s.x + 8, s.z + 8, s.y - 40, s.y + 2); for(let i = -12; i <= 12; i += 2) for(let j = -12; j <= 12; j += 2){ const h = hitAt({ x: s.x + i * cell, y: s.y, z: s.z + j * cell }, DOWN, 40); if(h !== null) fl.push(s.y - h); } }
  if(fl.length < 3) return { error: 'no floor near start', n: fl.length };
  fl.sort((a, b) => a - b);
  let floor0 = fl[fl.length >> 1];
  // 開始位置の真下が台・ステージ・家具の上のことがある（See You Tomorrow 4F: 床 104㎡ なのに同じ高さの升が 0 で候補なし。2026-11-21）。
  // 周り 16m 四方を 1m おきに見て、一番多い床の高さ（10cm 刻み）が開始位置の真下より多ければそちらを床にする
  {
    cov(s.x - 9, s.z - 9, s.x + 9, s.z + 9, floor0 - 3, s.y + 2);
    const bins = new Map(); const top = Math.max(s.y, floor0 + 2.3);
    for(let i = -8; i <= 8; i++) for(let j = -8; j <= 8; j++){ const h = hitAt({ x: s.x + i, y: top, z: s.z + j }, DOWN, top - floor0 + 2); if(h === null) continue; const f = top - h; if(Math.abs(f - floor0) > 2) continue; const b = Math.round(f * 10); bins.set(b, (bins.get(b) || 0) + 1); }
    const near = (b) => (bins.get(b - 1) || 0) + (bins.get(b) || 0) + (bins.get(b + 1) || 0);
    let bb = Math.round(floor0 * 10), bn = near(bb);
    for(const b of bins.keys()) if(near(b) > bn * 1.5 + 3){ bn = near(b); bb = b; }
    if(bb !== Math.round(floor0 * 10)) floor0 = bb / 10;
  }
  const eye = Math.min(2, Math.max(1, s.y - floor0));
  const see = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz); if(L < 1e-3) return true; covSeg(a, b); return hitAt(a, { x: dx / L, y: dy / L, z: dz / L }, L - 0.05) === null; };
  const yLo = floor0 - 1.5, yHi = floor0 + eye + 1.5;
  const DIRS = Array.from({ length: ND }, (_, k) => { const a = k * 2 * Math.PI / ND; return { a, v: { x: Math.sin(a), y: 0, z: Math.cos(a) } }; });
  const why = { cover: 0, nofloor: 0, level: 0, tight: 0 };
  const cells = [];
  let floorN = 0;
  const t0 = performance.now(), per = Math.round(B / cell);
  for(let bx = -R; bx < R; bx += B) for(let bz = -R; bz < R; bz += B){
    // 円の外のブロックは飛ばす
    const nx = Math.max(bx, Math.min(0, bx + B)), nz = Math.max(bz, Math.min(0, bz + B));
    if(Math.hypot(nx, nz) > R) continue;
    if(!cov(s.x + bx - RAY, s.z + bz - RAY, s.x + bx + B + RAY, s.z + bz + B + RAY, yLo, yHi)){ why.cover += per * per; continue; }
  for(let i = 0; i < per; i++) for(let j = 0; j < per; j++){
    const x = s.x + bx + i * cell, z = s.z + bz + j * cell;
    if(Math.hypot(x - s.x, z - s.z) > R) continue;
    const top = { x, y: floor0 + eye + 0.3, z };
    const h = hitAt(top, DOWN, eye + 1);
    if(h === null){ why.nofloor++; continue; }
    const f = top.y - h;
    if(Math.abs(f - floor0) <= 1) floorN++;   // 広さ（家具の下・段差も含めた同じ階の床）
    if(Math.abs(f - floor0) > 0.3){ why.level++; continue; }
    const e = { x, y: f + eye, z };
    if(hitAt({ x, y: f + 0.3, z }, UP, eye - 0.1) !== null || hitAt(e, UP, 0.4) !== null){ why.tight++; continue; }
    const d = DIRS.map(({ v }) => { const hh = hitAt(e, v, RAY); return hh === null ? RAY : hh; });
    const clear = Math.min(...d);
    if(clear < 0.5){ why.tight++; continue; }
    const miss = d.filter(v => v >= RAY).length / ND, open = d.reduce((a, b) => a + b, 0) / ND;
    // 一番ひらけた向き（隣どうし 3 方向の平均で）
    let bk = 0, bv = -1; for(let k = 0; k < ND; k++){ const v = d[(k + ND - 1) % ND] + d[k] + d[(k + 1) % ND]; if(v > bv){ bv = v; bk = k; } }
    cells.push({ x, z, f, e, clear, open, miss, yaw: DIRS[bk].a });
  }
  }
  const scanMs = Math.round(performance.now() - t0);
  const start = { x: s.x, z: s.z, e: { x: s.x, y: floor0 + eye, z: s.z } };
  const chosen = [start], out = [], blocked = new Set();
  const dmin = (c) => Math.min(...chosen.map(q => Math.hypot(c.x - q.x, c.z - q.z)));
  // 候補の数は広さで決める（2026-11-20 本人「広さによって変えるべき」）: 床（家具の下も含む同じ階の床）12㎡ に 1 か所、6〜40 か所。
  // 歩ける升だけで測ると、家具の多いスタジオは通路だけになって狭く出る（Studio Union: 歩ける 54㎡）
  const area = floorN * cell * cell, walkArea = cells.length * cell * cell, max = o.max || Math.max(6, Math.min(40, Math.round(area / 12)));
  while(out.length < max){
    let best = null, bs = -1;
    for(const c of cells){
      if(blocked.has(c)) continue;
      const dd = dmin(c); if(dd < gap) continue;
      // 新しく見える範囲（離れているほど）× 部屋の真ん中らしさ（壁までの距離）× 撮影範囲の中らしさ（何にも当たらない方向が少ない）
      const sc = Math.min(dd, 8) * (0.35 + Math.min(c.clear, 1.6) / 1.6) * (1 - 0.6 * c.miss);
      if(sc > bs){ bs = sc; best = c; }
    }
    if(!best) break;
    if(!chosen.some(q => Math.hypot(best.x - q.x, best.z - q.z) <= reach && see(q.e, best.e))){ blocked.add(best); continue; }
    chosen.push(best);
    out.push({ id: 'c' + (out.length + 1), pos: best.e, yaw: best.yaw, floorY: best.f, clear: +best.clear.toFixed(2), open: +best.open.toFixed(2), miss: +best.miss.toFixed(2) });
  }
  const nodes = chosen.map(q => q.e), vis = nodes.map((a, i) => nodes.map((b, j) => i !== j && Math.hypot(a.x - b.x, a.z - b.z) <= reach && see(a, b)));
  return { points: out, vis, eye, floor0, why, area: Math.round(area), walkArea: Math.round(walkArea), max, whole: !!W, scanMs, cells: cells.map(c => [+c.x.toFixed(2), +c.z.toFixed(2), +c.clear.toFixed(1), +c.f.toFixed(2), +c.yaw.toFixed(3)]) };
};`;

// ── AI に見せる画像 ──
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 4 方向の横の面を左から L F R B に並べた 360° の帯（中央が F = その地点の向き）
export async function strip(faces, label, file) {
  const W = 320;
  const tiles = await Promise.all(['l', 'f', 'r', 'b'].map((k) => sharp(faces[k]).resize(W, W).toBuffer()));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 4}" height="${W}">${['L', 'F', 'R', 'B'].map((t, i) => `<text x="${i * W + 8}" y="${W - 10}" font-family="Arial" font-size="20" font-weight="bold" fill="#ff0" stroke="#000" stroke-width="1">${t}</text>`).join('')}<rect x="0" y="0" width="${16 + label.length * 15}" height="32" fill="#000" opacity="0.7"/><text x="8" y="24" font-family="Arial" font-size="22" font-weight="bold" fill="#fff">${esc(label)}</text></svg>`;
  await sharp({ create: { width: W * 4, height: W, channels: 3, background: '#000' } })
    .composite([...tiles.map((b, i) => ({ input: b, left: i * W, top: 0 })), { input: Buffer.from(svg), left: 0, top: 0 }])
    .jpeg({ quality: 78 }).toFile(file);
}
// 上から見た配置図（灰 = 歩ける床、S = 開始位置、番号 = 候補、短い線 = 向き F）
export async function map(cells, start, pts, file) {
  const xs = [start.x, ...cells.map((c) => c[0])], zs = [start.z, ...cells.map((c) => c[1])];
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1;
  const S = Math.min(900 / (x1 - x0), 900 / (z1 - z0)), W = Math.ceil((x1 - x0) * S), H = Math.ceil((z1 - z0) * S);
  const X = (x) => ((x - x0) * S).toFixed(1), Z = (z) => ((z - z0) * S).toFixed(1);
  const cs = Math.max(2, 0.5 * S);
  let g = cells.map((c) => `<rect x="${X(c[0] - 0.25)}" y="${Z(c[1] - 0.25)}" width="${cs.toFixed(1)}" height="${cs.toFixed(1)}" fill="${c[2] >= 1.2 ? '#bbb' : '#888'}"/>`).join('');
  for (const p of pts) {
    const ex = p.pos.x + Math.sin(p.yaw) * 1.2, ez = p.pos.z + Math.cos(p.yaw) * 1.2;
    g += `<line x1="${X(p.pos.x)}" y1="${Z(p.pos.z)}" x2="${X(ex)}" y2="${Z(ez)}" stroke="#06c" stroke-width="3"/><circle cx="${X(p.pos.x)}" cy="${Z(p.pos.z)}" r="9" fill="#06c"/><text x="${(+X(p.pos.x) + 11).toFixed(1)}" y="${(+Z(p.pos.z) + 6).toFixed(1)}" font-family="Arial" font-size="18" font-weight="bold" fill="#c00">${esc(p.id)}</text>`;
  }
  g += `<circle cx="${X(start.x)}" cy="${Z(start.z)}" r="11" fill="#e80"/><text x="${(+X(start.x) + 13).toFixed(1)}" y="${(+Z(start.z) + 6).toFixed(1)}" font-family="Arial" font-size="20" font-weight="bold" fill="#e80">S</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${g}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

// 広さ（歩ける床の㎡）→ 使う地点の上限・足りない所の指摘の上限
export function limits(area) {
  const a = Number(area) || 0;
  return { keep: Math.max(4, Math.min(24, Math.round(a / 25))), gaps: Math.max(3, Math.min(10, Math.round(a / 60))) };
}

// ── AI の判定（ローカルの Claude Code。鍵は持たない） ──
const PROMPT = (dir, ids, round, prev, area, lim) => `あなたはロケハン（撮影場所探し）サイト Locahun 3D の品質チェック担当です。
3DGS（3D スキャン）の物件ページで、軽い端末向けに「360° 写真ツアー」を出します。地点ごとの 360° 写真を見て、使う地点・歩く順・足りない場所を決めてください。
見る人は映像の制作会社で、この空間で何が撮れるか（部屋ごとの広さ・窓・壁・設備・雰囲気）を知りたい人です。

ファイル（${dir} にある。全部見ること。画像が添付されている時は、添付の順番が map.png, S.jpg, ${ids.map((i) => i + '.jpg').join(', ')}）:
- 歩ける床の広さはおよそ ${area}㎡。使う地点は多くても ${lim.keep} か所（広さに見合う数。狭い所に詰め込まない）。
- map.png: 上から見た配置図。灰色＝歩ける床、オレンジの S＝開始位置、青い丸と赤い番号＝地点、青い短い線＝その地点の正面（F）の向き。
- S.jpg: 開始位置の 360° 帯（すでに使っている。比べる基準）。
- ${ids.map((i) => i + '.jpg').join(', ')}: 各地点の 360° 帯。左から L（左）・F（正面）・R（右）・B（後ろ）の 4 方向（各 90°）。目の高さ。
${round > 1 ? `\nこれは 2 回目です。1 回目の判定: ${prev}\n足りないと言われた所を撮り足した地点が加わっています。` : ''}
判定の基準:
- 使わない: ぼやけ・にじみ・ちぎれた点（スキャン範囲の外や端）、外の景色がつぶれて写る、壁や家具が目の前で何も見えない、家具や物の中に入っている、
  他の地点とほとんど同じ画（近すぎる・同じ部屋の同じ眺め）。
- 使う: その場所の様子がはっきり分かり、S や他の地点では見えない場所・眺めを足すもの。良い地点は部屋の中ほどで、空間の広がりが分かる。
- 足りない場所: スキャンされていて歩ける（配置図の灰色）のに、良い地点が無い部屋・区画・通路の先。写真の中に見えているのに地点が無い場所も。
  「どの地点から（S も可）・どちらの方向（L/F/R/B）・何 m 先（1〜8）」で言う。必要なものだけ。最大 ${lim.gaps} か所。スキャンの外（灰色でない所）は言わない。
- 揃った（complete）: 使う地点で、この物件の主な場所がひと通り見られて、悪い画が混ざっていない。

答えは JSON だけ（前後に文章を書かない）:
{"points":[{"id":"c1","score":1〜5,"keep":true/false,"reason":"短く"}],"order":["c3","c1",...],"gaps":[{"from":"S","dir":"L","meters":4,"why":"短く"}],"complete":true/false,"summary":"日本語で 1〜2 文"}
order は S から歩いて回る自然な順（keep の地点だけ）。points には全地点を入れる。`;

// 判定する AI: engine = 'auto'（Claude Code → だめなら Codex）/ 'claude' / 'codex'。どちらもこの PC のログインで動く（API の鍵は持たない）。
// 戻り値に by（使ったもの）を付ける。
export function review(dir, ids, { engine = 'auto', model = '', round = 1, prev = '', area = 0 } = {}) {
  const prompt = PROMPT(dir.replace(/\\/g, '/'), ids, round, prev, Math.round(area), limits(area));
  const tries = engine === 'auto' ? ['claude', 'codex'] : [engine];
  const errs = [];
  for (const e of tries) {
    const text = e === 'codex' ? runCodex(dir, ids, prompt, model) : runClaude(dir, prompt, model);
    if (text.error) { errs.push(e + ': ' + text.error); continue; }
    const j = parseVerdict(text.text);
    if (j.error) { errs.push(e + ': ' + j.error); continue; }
    j.by = e + ':' + (text.model || 'default');
    return j;
  }
  return { error: errs.join(' / ').slice(0, 400) };
}
function runClaude(dir, prompt, model) {
  const m = model || 'fable';
  const r = spawnSync(process.platform === 'win32' ? 'claude.cmd' : 'claude', ['-p', '--model', m, '--output-format', 'json', '--allowedTools', 'Read', '--add-dir', dir],
    { input: prompt, encoding: 'utf8', timeout: 15 * 60 * 1000, shell: process.platform === 'win32', maxBuffer: 32 << 20 });
  if (r.error) return { error: String(r.error.message).slice(0, 200) };
  let o = null; try { o = JSON.parse(r.stdout); } catch { /* 下で */ }
  if (o?.is_error || r.status !== 0) return { error: String(o?.result || r.stderr || r.stdout || 'failed').slice(0, 200) };
  return { text: o ? String(o.result ?? '') : r.stdout, model: m };
}
function runCodex(dir, ids, prompt, model, files = null) {
  const m = model && !/^(fable|opus|sonnet|haiku)/.test(model) ? model : 'gpt-6-astra';   // ChatGPT アカウントで動くもの（gpt-5.5 等は拒否される）
  const out = path.join(dir, `codex-last-${Date.now()}.txt`);
  const imgs = (files || ['map.png', 'S.jpg', ...ids.map((i) => i + '.jpg')]).flatMap((f) => ['-i', path.join(dir, f)]);
  const r = spawnSync(process.platform === 'win32' ? 'codex.cmd' : 'codex', ['exec', '--skip-git-repo-check', '-m', m, '-s', 'read-only', '-o', out, ...imgs, '-'],
    { input: prompt, encoding: 'utf8', timeout: 20 * 60 * 1000, shell: process.platform === 'win32', maxBuffer: 32 << 20, cwd: dir });
  if (r.error) return { error: String(r.error.message).slice(0, 200) };
  const text = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  fs.rmSync(out, { force: true });
  if (r.status !== 0 || !text) return { error: String(r.stderr || r.stdout || 'failed').slice(-200) };
  return { text, model: m };
}
function parseVerdict(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) return { error: 'JSON が無い: ' + String(text).slice(0, 200) };
  try {
    const j = JSON.parse(m[0]);
    if (!Array.isArray(j.points)) return { error: 'points が無い' };
    return j;
  } catch (e) { return { error: 'JSON が読めない: ' + String(e.message).slice(0, 100) }; }
}

// ── 動線グラフの監視（2026-11-21）: 地点は動線から敷き詰める（tour-graph.mjs）。AI は選ばず、壊れた地点だけを見つける ──
// 移動のために 2m おきに置いているので、似た画・地味な画は外さない。外すのは「そこに立つと何も分からない・おかしい」所だけ。
// あわせて、写真に写っているのに地点が無い（動線が途切れた）場所を missing として残す（自動では直せないので監視の記録に出す）。
const NODE_PROMPT = (dir, ids, total) => `あなたはロケハンサイト Locahun 3D の 360° 写真ツアーの監視担当です。
3DGS（3D スキャン）の空間に、見る人が歩くように移動できるよう、歩ける床の上へ約 2m おきに地点を自動で置き、各地点の 360° 写真を撮りました（全 ${total} 地点のうち今回 ${ids.length} 地点）。
地点の数や位置は動線から機械的に決めています。あなたの役目は「壊れた地点」を見つけることだけです。

ファイル（${dir} にある。添付の順番は map.png, ${ids.map((i) => i + '.jpg').join(', ')}）:
- map.png: 上から見た図。色の付いた升＝歩ける床（色は床の高さ。青＝低い→黄〜赤＝高い）、青い点と赤い番号＝地点、オレンジの点＝階段・段差の上の地点、線＝移動できるつながり、オレンジの輪＝開始位置。
- 各 <番号>.jpg: その地点の 360° 帯（左から L・F・R・B の 4 方向、目の高さ）。

外す（ok:false）のは次のどれかがはっきりしている地点だけ:
- 壁・家具・物の中に入っている（画面の大半が物の内側・色の塊）
- 撮影範囲の外・端で、画面の大半が黒・空白・ちぎれた点でつぶれている
- 崩れがひどく、そこがどんな場所か分からない
- 人が立てない場所にいる: 木・植え込みの上や中、屋根・塀・手すり・家具・車の上（足元に地面・床・階段が写らず、枝葉や物の上から見下ろしている）
似た画が続く・地味・通路の途中・少しのにじみは外さない（移動の途中の地点として必要）。迷ったら ok:true。

あわせて、写真に「歩いて行けそうな場所（階段・通路・ドアの先・別の部屋）」がはっきり写っているのに、図で近くに地点も歩ける床も無い所があれば missing に書く（最大 5 件）。

答えは JSON だけ:
{"nodes":[{"id":"n1","ok":true,"reason":"外す時だけ短く"}],"missing":[{"near":"n12","dir":"L/F/R/B","why":"短く"}],"summary":"日本語で 1 文"}
nodes には今回の全地点を入れる。`;
export function reviewNodes(dir, ids, { engine = 'auto', model = '', batch = 20 } = {}) {
  const out = { bad: [], missing: [], summary: [], by: '', errors: [] };
  const tries = engine === 'auto' ? ['claude', 'codex'] : [engine];
  for (let i = 0; i < ids.length; i += batch) {
    const part = ids.slice(i, i + batch), prompt = NODE_PROMPT(dir.split(path.sep).join('/'), part, ids.length);
    let done = false;
    for (const e of tries) {
      const t = e === 'codex' ? runCodex(dir, part, prompt, model, ['map.png', ...part.map((x) => x + '.jpg')]) : runClaude(dir, prompt, model);
      if (t.error) { out.errors.push(e + ': ' + t.error); continue; }
      const m = /\{[\s\S]*\}/.exec(t.text || '');
      let j = null; try { j = m && JSON.parse(m[0]); } catch { j = null; }
      if (!j || !Array.isArray(j.nodes)) { out.errors.push(e + ': JSON が読めない'); continue; }
      for (const n of j.nodes) if (n && n.ok === false && part.includes(String(n.id))) out.bad.push({ id: String(n.id), reason: String(n.reason || '').slice(0, 80) });
      for (const g of (j.missing || []).slice(0, 5)) out.missing.push({ near: String(g.near || ''), dir: String(g.dir || ''), why: String(g.why || '').slice(0, 80) });
      if (j.summary) out.summary.push(String(j.summary).slice(0, 120));
      out.by = e + ':' + (t.model || 'default'); done = true; break;
    }
    if (!done) return { error: out.errors.join(' / ').slice(0, 400), partial: out };
  }
  return { ...out, summary: out.summary.join(' ').slice(0, 300) };
}

// 足りない場所 → 歩ける升（近くの升、既存の地点から 1.5m 以上離す）
const DIRYAW = { F: 0, R: -Math.PI / 2, B: Math.PI, L: Math.PI / 2 };
export function gapPositions(gaps, nodes, cells, eye, area = 0) {
  const out = [];
  for (const g of (gaps || []).slice(0, limits(area).gaps)) {
    const from = nodes[g.from]; if (!from) continue;
    const a = from.yaw + (DIRYAW[String(g.dir || '').toUpperCase()] ?? 0), d = Math.max(1, Math.min(8, Number(g.meters) || 3));
    const tx = from.pos.x + Math.sin(a) * d, tz = from.pos.z + Math.cos(a) * d;
    const taken = [...Object.values(nodes), ...out];
    let best = null, bd = 1e9;
    for (const c of cells) {
      const dd = Math.hypot(c[0] - tx, c[1] - tz); if (dd > 2 || c[2] < 0.6) continue;
      if (taken.some((p) => Math.hypot(p.pos.x - c[0], p.pos.z - c[1]) < 1.5)) continue;
      const sc = dd - 0.3 * Math.min(c[2], 1.6); if (sc < bd) { bd = sc; best = c; }
    }
    if (best) out.push({ pos: { x: best[0], y: best[3] + eye, z: best[1] }, yaw: best[4], floorY: best[3], from: g.from, why: g.why });
  }
  return out;
}

export { fs, path };
