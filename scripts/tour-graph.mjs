// 360° 写真ツアーの「動線グラフ」（2026-11-21 本人「360画像がみれる地点、歩ける所が少なすぎて移動できない、階段に弱い、
// 動線で欲しいところがなく移動にはとてもストレスがある」「動線を割り出す仕組みやAI監視を仕組みにする必要がある」）。
//
// 以前（tour-ai.mjs の PAGE_CANDS）は開始位置と同じ高さ（±0.3m）の床だけから、AI が「見どころ」を 4〜24 か所選んでいた。
// そのため階段・別の階・段差の先には地点が無く、地点どうしも離れていて歩くように移れなかった。
// ここでは:
//  1. 歩ける床をたどる（PAGE_GRAPH、ビューアーの中で動く）: 開始位置の床から 0.5m 升で塗り広げる。
//     隣の升へは「段差 0.42m 以下・体（ひざ〜目の高さ）が入る・間に壁が無い」なら行ける。階段は 1 段ずつ上れるので別の階までつながる。
//  2. 地点を敷き詰める（buildGraph、Node）: 歩いた距離（升をたどった距離）で一番遠い所に次の地点を置くのを、
//     どこからでも S（約 2m、広い所は広げる）以内に地点がある状態になるまで繰り返す。置く場所は近くで一番壁から離れた升（通路の真ん中）。
//  3. つなぐ: 各升を一番近い地点に割り当て、隣り合う升が別の地点なら、その 2 地点をつなぐ（歩ける床の上の隣どうし。壁越しにはつながらない）。
//     地点を外しても割り当て直すだけで、残りは必ずつながったまま。
//  4. 見通し（PAGE_LOS）: 8m 以内で目の高さどうしが見える組。ビューアーは「つながった地点＋見える地点」に床の丸を出す。
// AI はこの後、各地点の写りだけを見て、壊れた地点（物の中・撮影範囲の外・崩れ）を外す（tour-ai.mjs reviewNodes）。
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

export const CELL = 0.5;

export const PAGE_GRAPH = `;window.__pbGraph=(o)=>{
  const core = typeof walkSetup !== 'undefined' && walkSetup.core;
  if(!core) return { error: 'no collision' };
  const W = walkSetup.wholeIndex, C = ${CELL}, STEP = o.step || 0.42, R = o.radius || 70, MAX = o.maxCells || 80000, B = 8;
  const eye = o.eye || 1.5, s = o.pos, t0 = performance.now(), TL = o.timeMs || 240000;
  const hit = (q, d, L) => { let h = null; try { h = core.raycast(q, d, L); } catch(e) {} return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  const DOWN = { x: 0, y: -1, z: 0 };
  let covKey = null, covN = 0;
  const cov = (bx, bz, by) => { const k = bx + ',' + bz + ',' + by; if(k === covKey || !W) return; covKey = k; covN++;
    try { core.setTileCoverage(W, { min: [bx * B - 2, by * 4 - 4, bz * B - 2], max: [bx * B + B + 2, by * 4 + 8, bz * B + B + 2] }); } catch(e) {} };
  // 床: 今の床（yRef）の 0.6m 上から下へ。段を上る・下る（0.9m まで）床を拾う
  // 床はそろっていること: 升の中の 4 点（±0.12m）の床の高さが真ん中と 0.25m 以上ずれる点が 2 つ以上なら床にしない。
  // 植え込み・木の当たり判定（升目の当たり判定なので面の向きは常に真上）は高さがばらつき、段差として登ってしまった
  // （牧之下ハウスで木の上に地点ができた。2026-11-21）。階段の踏み面は 0.25m 以上の奥行きがあり、蹴上げ 0.2m 前後なので通る
  let steep = 0;
  const floorAt = (x, z, yRef) => { const top = yRef + STEP + 0.03, L = STEP + 0.95;
    const h = hit({ x, y: top, z }, DOWN, L); if(h === null) return null;
    const f = top - h; let off = 0;
    for(const [dx, dz] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]){ const hh = hit({ x: x + dx, y: top, z: z + dz }, DOWN, L); if(hh === null || Math.abs(top - hh - f) > 0.25) off++; }
    if(off >= 2){ steep++; return null; }
    return f; };
  // 体が入る: ひざ（段の上）から目の高さ＋0.1m まで、半径 0.2m
  const bodyOk = (x, z, f) => { try { return core.isCapsuleClear({ x, y: f + 0.35, z }, eye - 0.25, 0.2); } catch(e) { return false; } };
  // 間に壁が無い: ひざ・胸の高さで升の中心どうしを水平に結ぶ
  const passOk = (a, x, z, f) => { const dx = x - a.x, dz = z - a.z, L = Math.hypot(dx, dz), d = { x: dx / L, y: 0, z: dz / L }, base = Math.max(a.f, f);
    return hit({ x: a.x, y: base + 0.5, z: a.z }, d, L) === null && hit({ x: a.x, y: base + 1.2, z: a.z }, d, L) === null; };
  const cells = [], adj = [], byXZ = new Map(), bad = new Set(), q = new Map();
  const find = (ix, iz, f) => { const L = byXZ.get(ix + ',' + iz); if(!L) return -1; for(const i of L) if(Math.abs(cells[i].f - f) < 0.3) return i; return -1; };
  const bkey = (c) => Math.floor(c.x / B) + ',' + Math.floor(c.z / B) + ',' + Math.floor(c.f / 4);
  const push = (i) => { const k = bkey(cells[i]); let L = q.get(k); if(!L) q.set(k, L = []); L.push(i); };
  const add = (ix, iz, f) => { const i = cells.length; cells.push({ ix, iz, x: ix * C, z: iz * C, f }); adj.push([]);
    const k = ix + ',' + iz; let L = byXZ.get(k); if(!L) byXZ.set(k, L = []); L.push(i); return i; };
  // 始まりの升: 開始位置の真下（o.floor0）と、周りで一番低く広い床の高さ（卓・ベンチの多い店で o.floor0 が座面の高さになった:
  // 新中野の居酒屋で 10㎡ しか広がらなかった。2026-11-21）。それぞれの高さで、開始位置の近くの体が入る升から塗り広げる。
  // 別々の塊になったら Node 側（largestComponent）で一番大きい塊を使う
  const ix0 = Math.round(s.x / C), iz0 = Math.round(s.z / C);
  const floors = [o.floor0];
  {
    cov(Math.floor(s.x / B), Math.floor(s.z / B), Math.floor((o.floor0 - 2) / 4));
    try { if(W) core.setTileCoverage(W, { min: [s.x - 9, Math.min(o.floor0, s.y) - 4, s.z - 9], max: [s.x + 9, s.y + 1, s.z + 9] }); covKey = null; } catch(e) {}
    const bins = new Map(), top = s.y + 0.3;
    for(let i = -8; i <= 8; i++) for(let j = -8; j <= 8; j++){ const h = hit({ x: s.x + i, y: top, z: s.z + j }, DOWN, 6); if(h !== null){ const b = Math.round((top - h) * 10); bins.set(b, (bins.get(b) || 0) + 1); } }
    const near = (b) => (bins.get(b - 1) || 0) + (bins.get(b) || 0) + (bins.get(b + 1) || 0);
    let mx = 0; for(const b of bins.keys()) mx = Math.max(mx, near(b));
    const low = [...bins.keys()].filter(b => near(b) >= Math.max(5, mx * 0.25)).sort((a, b) => a - b)[0];
    if(low !== undefined && Math.abs(low / 10 - o.floor0) > 0.25) floors.push(low / 10);
  }
  const seeds = [];
  for(const fl of floors){
    let seed = -1;
    cov(Math.floor(s.x / B), Math.floor(s.z / B), Math.floor(fl / 4)); covKey = null;
    try { if(W) core.setTileCoverage(W, { min: [s.x - 9, fl - 2, s.z - 9], max: [s.x + 9, fl + 3, s.z + 9] }); } catch(e) {}
    for(let r = 0; r <= 16 && seed < 0; r++) for(let i = -r; i <= r && seed < 0; i++) for(let j = -r; j <= r && seed < 0; j++){
      if(Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const x = (ix0 + i) * C, z = (iz0 + j) * C, f = floorAt(x, z, fl);
      if(f !== null && Math.abs(f - fl) < 0.5 && bodyOk(x, z, f)){ seed = find(ix0 + i, iz0 + j, f); if(seed < 0){ seed = add(ix0 + i, iz0 + j, f); push(seed); } }
    }
    if(seed >= 0) seeds.push(seed);
  }
  if(!seeds.length) return { error: 'no walkable cell at start', floors };
  const seed = seeds[0];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let timeout = false; const why = { nofloor: 0, step: 0, body: 0, pass: 0 };
  while(q.size && cells.length < MAX){
    if(performance.now() - t0 > TL){ timeout = true; break; }
    const [k, list] = q.entries().next().value; q.delete(k);
    const [bx, bz, by] = k.split(',').map(Number); cov(bx, bz, by);
    while(list.length){
      const i = list.pop(), c = cells[i];
      for(const [dx, dz] of N4){
        const jx = c.ix + dx, jz = c.iz + dz, x = jx * C, z = jz * C;
        if(Math.hypot(x - s.x, z - s.z) > R) continue;
        const f = floorAt(x, z, c.f);
        if(f === null){ why.nofloor++; continue; }
        if(Math.abs(f - c.f) > STEP){ why.step++; continue; }
        let j = find(jx, jz, f);
        if(j < 0){
          const bk = jx + ',' + jz + ',' + Math.round(f * 10);
          if(bad.has(bk)) continue;
          if(!bodyOk(x, z, f)){ bad.add(bk); why.body++; continue; }
          if(!passOk(c, x, z, f)){ why.pass++; continue; }
          j = add(jx, jz, f);
          if(bkey(cells[j]) === k) list.push(j); else push(j);
        } else if(adj[i].includes(j) || !passOk(c, x, z, f)) continue;
        adj[i].push(j); adj[j].push(i);
      }
    }
  }
  return { cells: cells.map(c => [+c.x.toFixed(2), +c.z.toFixed(2), +c.f.toFixed(3)]), adj, seed, eye, timeout, capped: cells.length >= MAX,
    ms: Math.round(performance.now() - t0), covN, whole: !!W, why: { ...why, steep }, seeds, floors };
};
;window.__pbDiag=(o)=>{ const core = walkSetup.core, W = walkSetup.wholeIndex; try { if(W) core.setTileCoverage(W, { min: [o.x - 7, o.y - 5, o.z - 7], max: [o.x + 7, o.y + 1, o.z + 7] }); } catch(e) {}
  const rows = []; for(let j = -12; j <= 12; j++){ let row = ''; for(let i = -12; i <= 12; i++){ const h = core.raycast({ x: o.x + i * 0.5, y: o.y + 0.3, z: o.z + j * 0.5 }, { x: 0, y: -1, z: 0 }, 5);
    row += h === null || !Number.isFinite(h) ? '  .' : String(Math.round((o.y + 0.3 - h) * 10)).padStart(4); } rows.push(row); } return rows.join(String.fromCharCode(10)); };
;window.__pbNormals=(o)=>{ const core = walkSetup.core, W = walkSetup.wholeIndex; try { if(W) core.setTileCoverage(W, { min: [o.x - 7, o.y - 8, o.z - 7], max: [o.x + 7, o.y + 2, o.z + 7] }); } catch(e) {}
  const h = {}; let err = '', sample = null;
  for(let i = -12; i <= 12; i++) for(let j = -12; j <= 12; j++){ let r; try { r = core.raycastSurface({ x: o.x + i * 0.5, y: o.y + 0.3, z: o.z + j * 0.5 }, { x: 0, y: -1, z: 0 }, 8); } catch(e) { err = String(e).slice(0, 80); continue; }
    if(!r){ h.none = (h.none || 0) + 1; continue; } if(!sample) sample = JSON.stringify(r).slice(0, 200);
    const n = r.normal ? Math.abs(r.normal.y) / Math.hypot(r.normal.x, r.normal.y, r.normal.z) : -1; const b = n < 0 ? 'nonormal' : (Math.floor(n * 10) / 10).toFixed(1); h[b] = (h[b] || 0) + 1; }
  return { h, err, sample }; };
;window.__pbNodeCheck=(o)=>{
  // 地点の形の検査（2026-11-21 本人「こういう空中やめり込んでるところを除外」）:
  //  tight = 目の高さの 16 方向で 0.35m 以内に当たる方向の数（崩れた点の塊・壁にめり込み）
  //  air = 目から斜め下 30° の 8 方向で、目の高さの 3 倍以内に何も当たらない方向の数（空中・スキャンの端・崩れの上）
  const core = walkSetup.core, W = walkSetup.wholeIndex;
  const hit = (q, d, L) => { let h = null; try { h = core.raycast(q, d, L); } catch(e) {} return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  return o.pts.map(p => {
    if(W){ try { core.setTileCoverage(W, { min: [p.x - 6, p.floorY - 6, p.z - 6], max: [p.x + 6, p.y + 2, p.z + 6] }); } catch(e) {} }
    const eye = p.y - p.floorY; let tight = 0, near = 0, air = 0, minC = 9;
    for(let k = 0; k < 16; k++){ const a = k * Math.PI / 8, d = { x: Math.sin(a), y: 0, z: Math.cos(a) }; const h = hit(p, d, 2); const c = h === null ? 2 : h; minC = Math.min(minC, c); if(c < 0.35) tight++; if(c < 0.6) near++; }
    const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
    for(let k = 0; k < 8; k++){ const a = k * Math.PI / 4, d = { x: Math.sin(a) * c30, y: -s30, z: Math.cos(a) * c30 }; if(hit(p, d, eye * 3 + 0.5) === null) air++; }
    return { tight, near, air, minC: +minC.toFixed(2) };
  });
};
;window.__pbClear=(o)=>{
  // 本人が置いた地点（座席など）のカメラの置き場所の検査（2026-11-23）: 目の高さの 16 方向で一番近い物までの距離 minC と、真下の面までの距離 down
  const core = walkSetup.core, W = walkSetup.wholeIndex;
  const hit = (q, d, L) => { let h = null; try { h = core.raycast(q, d, L); } catch(e) {} return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  return o.pts.map(p => {
    if(W){ try { core.setTileCoverage(W, { min: [p.x - 3, p.y - 3, p.z - 3], max: [p.x + 3, p.y + 2, p.z + 3] }); } catch(e) {} }
    let minC = 9; for(let k = 0; k < 16; k++){ const a = k * Math.PI / 8; const h = hit(p, { x: Math.sin(a), y: 0, z: Math.cos(a) }, 1); minC = Math.min(minC, h === null ? 1 : h); }
    const dn = hit(p, { x: 0, y: -1, z: 0 }, 3), up = hit(p, { x: 0, y: 1, z: 0 }, 3);
    return { minC: +minC.toFixed(2), down: dn === null ? 9 : +dn.toFixed(2), up: up === null ? 9 : +up.toFixed(2) };
  });
};
;window.__pbFloorProbe=(o)=>{
  // --dense の見どころ探し（2026-11-23）: 各点の真下の面を中心と周り 0.7m の 8 方向で探し、いちばん低い面（座席・卓のそばの床、舞台の上は舞台の面）を返す
  const core = walkSetup.core, W = walkSetup.wholeIndex;
  const hit = (q, d, L) => { let h = null; try { h = core.raycast(q, d, L); } catch(e) {} return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  return o.pts.map(p => {
    if(W){ try { core.setTileCoverage(W, { min: [p.x - 2, p.y - (o.L || 4), p.z - 2], max: [p.x + 2, p.y + 1, p.z + 2] }); } catch(e) {} }
    let lo = null, n = 0;
    for(let k = -1; k < 8; k++){ const a = k * Math.PI / 4, r = k < 0 ? 0 : 0.7; const h = hit({ x: p.x + r * Math.sin(a), y: p.y, z: p.z + r * Math.cos(a) }, { x: 0, y: -1, z: 0 }, o.L || 4);
      if(h !== null){ n++; const f = p.y - h; lo = lo === null ? f : Math.min(lo, f); } }
    return n >= 5 ? +lo.toFixed(3) : null;
  });
};
;window.__pbLos=(o)=>{
  const core = walkSetup.core, W = walkSetup.wholeIndex;
  const hit = (q, d, L) => { let h = null; try { h = core.raycast(q, d, L); } catch(e) {} return h !== null && Number.isFinite(h) && h >= 0 && h < L ? h : null; };
  const out = [];
  for(const [i, j] of o.pairs){
    const a = o.pts[i], b = o.pts[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
    if(W){ try { core.setTileCoverage(W, { min: [Math.min(a.x, b.x) - 1, Math.min(a.y, b.y) - 2, Math.min(a.z, b.z) - 1], max: [Math.max(a.x, b.x) + 1, Math.max(a.y, b.y) + 1, Math.max(a.z, b.z) + 1] }); } catch(e) {} }
    if(hit(a, { x: dx / L, y: dy / L, z: dz / L }, L - 0.05) === null) out.push([i, j]);
  }
  return out;
};`;

// ── Node 側 ──
// 小さな二分ヒープ（Dijkstra 用）
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) { const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; } k[i] = key; v[i] = val; }
  pop() { const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; } k[i] = lk; v[i] = lv; }
    return top; }
}

// 升 i → j の歩く距離（段差も足す）
const wlen = (cells, i, j) => Math.hypot(cells[i][0] - cells[j][0], cells[i][1] - cells[j][1], cells[i][2] - cells[j][2]);

// 一番大きい塊だけ残す（別々の高さから塗った塊・孤立した升を落とす）。seed = 残した塊で開始位置に一番近い升
export function largestComponent(cells, adj, start) {
  const comp = new Int32Array(cells.length).fill(-1), sizes = [];
  for (let i = 0; i < cells.length; i++) { if (comp[i] >= 0) continue; const c = sizes.length, qq = [i]; comp[i] = c;
    for (let h = 0; h < qq.length; h++) for (const j of adj[qq[h]]) if (comp[j] < 0) { comp[j] = c; qq.push(j); } sizes.push(qq.length); }
  const big = sizes.indexOf(Math.max(...sizes));
  const map = new Int32Array(cells.length).fill(-1), nc = [];
  for (let i = 0; i < cells.length; i++) if (comp[i] === big) { map[i] = nc.length; nc.push(cells[i]); }
  const na = nc.map(() => []);
  for (let i = 0; i < cells.length; i++) if (map[i] >= 0) for (const j of adj[i]) if (map[j] >= 0) na[map[i]].push(map[j]);
  let seed = 0, bd = Infinity;
  nc.forEach((c, i) => { const d = Math.hypot(c[0] - start.x, c[1] - start.z) + Math.abs(c[2] - (start.floor ?? c[2])) * 0.5; if (d < bd) { bd = d; seed = i; } });
  return { cells: nc, adj: na, seed, parts: sizes.length, dropped: cells.length - nc.length };
}

// 家具の上を外す（2026-11-22 TKナイトクラブ: ソファの座面・テーブルの上に地点が乗った）。控えめに: 確かなものだけ。
// まわり 1.6m の一番低い床より 0.3m 以上高い升をつなげた「高い所」のうち、中に 4㎡を超える平らな所が無く、
// 外側がすべて低い床のもの（上へ続かない台）を家具とみなして外す。階段・上の階・舞台は残る。
// 取りこぼし（背もたれ付きの席など）は、撮った後の AI が外し、近くの低い床へ置き直す（lowFloor）。
export function lowFloor(cells) {
  const key = (x, z) => Math.round(x / CELL) + ',' + Math.round(z / CELL), at = new Map();
  cells.forEach((c, i) => { const k = key(c[0], c[1]); (at.get(k) || at.set(k, []).get(k)).push(i); });
  const R = Math.round(1.6 / CELL), up = new Float32Array(cells.length);
  for (let i = 0; i < cells.length; i++) { const cx = Math.round(cells[i][0] / CELL), cz = Math.round(cells[i][1] / CELL); let lo = cells[i][2];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { if (dx * dx + dz * dz > R * R) continue; for (const j of at.get((cx + dx) + ',' + (cz + dz)) || []) if (Math.abs(cells[j][2] - cells[i][2]) < 1.2) lo = Math.min(lo, cells[j][2]); }
    up[i] = cells[i][2] - lo; }
  return up;   // 近くの一番低い床からの高さ m
}
export function removeFurniture(cells, adj) {
  const n = cells.length, pl = new Int32Array(n).fill(-1), psize = [];
  for (let i = 0; i < n; i++) { if (pl[i] >= 0) continue; const g = [i]; pl[i] = psize.length;
    for (let h = 0; h < g.length; h++) for (const j of adj[g[h]]) if (pl[j] < 0 && Math.abs(cells[j][2] - cells[g[h]][2]) <= 0.12) { pl[j] = psize.length; g.push(j); }
    psize.push(g.length); }
  const BIG = Math.ceil(4 / (CELL * CELL)), up = lowFloor(cells);
  const drop = new Uint8Array(n), seen = new Uint8Array(n), groups = []; let removed = 0;   // groups: 外した家具の塊（座席・テーブル・カウンター。--dense で視点を置く）
  for (let i = 0; i < n; i++) { if (up[i] < 0.3 || seen[i]) continue; const g = [i]; seen[i] = 1; let big = psize[pl[i]] > BIG;
    for (let h = 0; h < g.length; h++) for (const j of adj[g[h]]) {
      if (up[j] >= 0.3) { if (!seen[j]) { seen[j] = 1; g.push(j); if (psize[pl[j]] > BIG) big = true; } }
      else if (cells[j][2] > cells[g[h]][2] - 0.2) big = true; }   // 外に同じ高さ以上の床が続く＝別の階・段の上へ行ける
    if (!big) { for (const k of g) drop[k] = 1; removed += g.length; groups.push(g.map((k) => [cells[k][0], cells[k][1], cells[k][2], +up[k].toFixed(2)])); } }
  if (!removed) return { cells, adj, removed: 0, groups };
  const map = new Int32Array(n).fill(-1), nc = [];
  for (let i = 0; i < n; i++) if (!drop[i]) { map[i] = nc.length; nc.push(cells[i]); }
  const na = nc.map(() => []);
  for (let i = 0; i < n; i++) if (map[i] >= 0) for (const j of adj[i]) if (map[j] >= 0) na[map[i]].push(map[j]);
  return { cells: nc, adj: na, removed, groups };
}

// 壁（行けない所）までの距離 m: 4 方向の隣が 4 つそろっていない升を 0 として升をたどる
export function clearance(cells, adj) {
  const d = new Float32Array(cells.length).fill(Infinity), qq = [];
  for (let i = 0; i < cells.length; i++) if (adj[i].length < 4) { d[i] = 0; qq.push(i); }
  for (let h = 0; h < qq.length; h++) { const i = qq[h]; for (const j of adj[i]) if (d[j] > d[i] + CELL) { d[j] = d[i] + CELL; qq.push(j); } }
  return d;
}

// 各升を一番近い（歩く距離で）地点に割り当てる → 隣り合う升が別の地点なら、その地点どうしをつなぐ
export function voronoi(cells, adj, nodeCells) {
  const dist = new Float64Array(cells.length).fill(Infinity), lab = new Int32Array(cells.length).fill(-1), h = new Heap();
  nodeCells.forEach((c, n) => { dist[c] = 0; lab[c] = n; h.push(0, c); });
  while (h.size) { const i = h.pop(); for (const j of adj[i]) { const nd = dist[i] + wlen(cells, i, j); if (nd < dist[j]) { dist[j] = nd; lab[j] = lab[i]; h.push(nd, j); } } }
  const es = new Set();
  for (let i = 0; i < cells.length; i++) for (const j of adj[i]) if (lab[i] >= 0 && lab[j] >= 0 && lab[i] !== lab[j]) es.add(Math.min(lab[i], lab[j]) + ',' + Math.max(lab[i], lab[j]));
  return { dist, lab, edges: [...es].map((e) => e.split(',').map(Number)) };
}

// 歩ける床（cells = [[x,z,floorY]], adj）から地点を敷き詰める
// opts: seed（開始位置の升）, eye, spacing（無ければ広さから）, maxNodes
export function buildGraph(cells, adj, { seed = 0, eye = 1.5, spacing = 0, maxNodes = 240 } = {}) {
  const n = cells.length, area = n * CELL * CELL;
  // 間隔: 2.4m が基本（部屋の中を歩く感覚。2m だと 285㎡ で 94 か所になり撮るのに時間がかかる）。広い屋外などは最大の数に収まるよう広げる（最大 5m）
  const S = spacing || Math.max(2.4, Math.min(5, Math.sqrt(area / (maxNodes * 0.55))));
  const clr = clearance(cells, adj), up = lowFloor(cells);
  const dist = new Float64Array(n).fill(Infinity), h = new Heap();
  const relax = (c) => { dist[c] = 0; h.push(0, c); while (h.size) { const i = h.pop(); for (const j of adj[i]) { const nd = dist[i] + wlen(cells, i, j); if (nd < dist[j]) { dist[j] = nd; h.push(nd, j); } } } };
  // 置く場所: 選んだ升から歩いて 0.8m 以内で、一番壁から離れた升（通路・部屋の真ん中へ寄せる）
  const snap = (c) => {
    const seen = new Map([[c, 0]]), qq = [c]; let best = c, bv = clr[c] - (up[c] >= 0.25 ? 9 : 0);
    for (let k = 0; k < qq.length; k++) { const i = qq[k]; for (const j of adj[i]) { const d = seen.get(i) + wlen(cells, i, j); if (d > 0.8 || seen.has(j)) continue; seen.set(j, d); qq.push(j); const v = clr[j] - (up[j] >= 0.25 ? 9 : 0); if (v > bv + 1e-6) { bv = v; best = j; } } }   // 家具の上らしい升（近くの床より 0.25m 以上高い）は避ける
    return best;
  };
  const nodeCells = [seed];
  relax(seed);
  while (nodeCells.length < maxNodes) {
    let best = -1, bv = 0;
    for (let i = 0; i < n; i++) { if (dist[i] === Infinity) continue; const v = dist[i] * (0.7 + 0.3 * Math.min(clr[i], 1) / 1); if (v > bv) { bv = v; best = i; } }
    if (best < 0) break;
    if (dist[best] < S) break;   // どこからでも S 以内に地点がある
    const c = snap(best);
    if (dist[c] < S * 0.5) { dist[best] = 0; continue; }   // 寄せたら既存の地点に近すぎた: その升は満たされた扱い
    nodeCells.push(c); relax(c);
  }
  const maxGap = Math.max(...Array.from(dist).filter(Number.isFinite));
  return { S, area, clr, nodeCells, maxGap, eye };
}

// 置き換え先の候補: 元の升から歩いて min〜max m、ほかの地点から 1.2m 以上離れた升を、壁から離れている順に
export function alternatives(cells, adj, clr, cell, takenPos, { min = 0.6, max = 2.2 } = {}) {
  const seen = new Map([[cell, 0]]), qq = [cell], out = [];
  for (let k = 0; k < qq.length; k++) { const i = qq[k];
    for (const j of adj[i]) { const d = seen.get(i) + wlen(cells, i, j); if (d > max || seen.has(j)) continue; seen.set(j, d); qq.push(j);
      if (d >= min && !takenPos.some((p) => Math.hypot(p.x - cells[j][0], p.z - cells[j][1]) < 1.2 && Math.abs(p.y - cells[j][2]) < 1.5)) out.push(j); } }
  const up = lowFloor(cells);   // 家具の上より近くの低い床を先に（AI に家具の上と言われた地点の置き直し）
  return out.sort((a, b) => (up[a] >= 0.25) - (up[b] >= 0.25) || clr[b] - clr[a]);
}

// 地点の情報（位置・床・向き・段差）。向き = 開始位置から離れる向き（写真は 360° なので見た目には影響しない。AI に見せる帯の正面）
export function nodeInfo(cells, adj, nodeCells, eye, clr) {
  const s = cells[nodeCells[0]];
  return nodeCells.map((c) => {
    const [x, z, f] = cells[c];
    let slope = 0; for (const j of adj[c]) slope = Math.max(slope, Math.abs(cells[j][2] - f));
    const dx = x - s[0], dz = z - s[1];
    return { cell: c, pos: { x, y: f + eye, z }, floorY: f, yaw: Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : 0, clr: +clr[c].toFixed(2), stair: slope > 0.2 };
  });
}

// 床の高さの段（階）を数える（0.25m 刻みで 2m 以上離れた高さの塊）
export function levels(cells) {
  const fs_ = [...new Set(cells.map((c) => Math.round(c[2] * 4) / 4))].sort((a, b) => a - b);
  let n = fs_.length ? 1 : 0; for (let i = 1; i < fs_.length; i++) if (fs_[i] - fs_[i - 1] > 0.6) n++;
  const lo = fs_[0] ?? 0, hi = fs_[fs_.length - 1] ?? 0;
  return { span: +(hi - lo).toFixed(2), groups: n };
}

// 上から見た配置図: 升を床の高さで色分け、地点（番号）と線（つながり）、外した地点は赤い×
export async function drawGraph(cells, nodes, edges, file, { dropped = [], start = null } = {}) {
  const xs = cells.map((c) => c[0]), zs = cells.map((c) => c[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1;
  const S = Math.min(1100 / (x1 - x0), 1100 / (z1 - z0)), W = Math.ceil((x1 - x0) * S), H = Math.ceil((z1 - z0) * S);
  const X = (x) => ((x - x0) * S).toFixed(1), Z = (z) => ((z - z0) * S).toFixed(1);
  const fl = cells.map((c) => c[2]), lo = Math.min(...fl), hi = Math.max(...fl), cs = Math.max(1.5, CELL * S).toFixed(1);
  const col = (f) => { const t = hi - lo < 0.3 ? 0 : (f - lo) / (hi - lo); return `hsl(${(220 - 200 * t).toFixed(0)},45%,${(78 - 18 * t).toFixed(0)}%)`; };
  let g = cells.map((c) => `<rect x="${X(c[0] - CELL / 2)}" y="${Z(c[1] - CELL / 2)}" width="${cs}" height="${cs}" fill="${col(c[2])}"/>`).join('');
  for (const [a, b] of edges) g += `<line x1="${X(nodes[a].pos.x)}" y1="${Z(nodes[a].pos.z)}" x2="${X(nodes[b].pos.x)}" y2="${Z(nodes[b].pos.z)}" stroke="#036" stroke-width="2"/>`;
  for (const p of nodes) g += `<circle cx="${X(p.pos.x)}" cy="${Z(p.pos.z)}" r="${p.stair ? 7 : 5}" fill="${p.stair ? '#e60' : '#06c'}"/><text x="${(+X(p.pos.x) + 7).toFixed(1)}" y="${(+Z(p.pos.z) - 5).toFixed(1)}" font-family="Arial" font-size="13" font-weight="bold" fill="#900">${p.id}</text>`;
  for (const p of dropped) g += `<text x="${(+X(p.pos.x) - 6).toFixed(1)}" y="${(+Z(p.pos.z) + 6).toFixed(1)}" font-family="Arial" font-size="18" font-weight="bold" fill="#f00">×</text>`;
  if (start) g += `<circle cx="${X(start.x)}" cy="${Z(start.z)}" r="9" fill="none" stroke="#e80" stroke-width="4"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${g}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

export { fs };

// 本人が置いた地点（--manual）のつながり（2026-11-23 TK MainHD）: 座席の点は歩ける床の外なので、床の区画（voronoi）ではつながらない。
// 見通せることが分かっている組（edges ∪ see）のうち、maxD m 以内をつながりにし、残りの塊は見通せる組の一番近いもの（無ければ一番近い組）で結ぶ。
export function relinkByDistance(pos, edges, see, maxD = 3) {
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a), d = (a, b) => Math.hypot(pos[a].x - pos[b].x, pos[a].z - pos[b].z);
  const los = new Map(); for (const [a, b] of [...edges, ...see]) los.set(key(a, b), [Math.min(a, b), Math.max(a, b)]);
  const E = new Map(); for (const [k, [a, b]] of los) if (d(a, b) <= maxD) E.set(k, [a, b]);
  const n = pos.length, par = [...Array(n).keys()], root = (i) => (par[i] === i ? i : (par[i] = root(par[i])));
  for (const [a, b] of E.values()) par[root(a)] = root(b);
  for (;;) {
    const comps = new Set([...Array(n).keys()].map(root)); if (comps.size <= 1) break;
    let best = null;
    for (const [k, [a, b]] of los) if (root(a) !== root(b) && (!best || d(a, b) < best.d)) best = { k, a, b, d: d(a, b) };
    if (!best) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (root(a) !== root(b) && (!best || d(a, b) < best.d)) best = { k: key(a, b), a, b, d: d(a, b) };
    E.set(best.k, [best.a, best.b]); par[root(best.a)] = root(best.b);
  }
  return { edges: [...E.values()], see: [...los].filter(([k]) => !E.has(k)).map(([, v]) => v) };
}
