// 物件ページの「位置から見る」（photoMaps）のデータを作る（2026-11-26）。
//   本人「2D表示、3Dビューアーと併用するのやめよう。代わりに物件ページに建物ごとに平面図に点を打った画像をのせよう」。
//   図 = tour-topdown.mjs が作った真上からの図（<name>_raw.png と <name>.json）を地点のまわりで切り抜いたもの。
//   点 = 本番の写真ツアーの地点（<key>.graph.json）。写真は地点の 6 方向の画像のうち横の 4 枚（/api/pano/<key>-g<set>-<id>-{f,r,b,l}.jpg）。
//   node scripts/photomap-build.mjs --property <id> --map "<名前>|<英名>|<topdown の json>[|th=20,close=1.6]" [--map ...] [--gap=<m>] [--upload] --out <file.json>
//   --upload なしは図を artifacts/photomap/ に置くだけ（R2 に書かない）。--gap は点を最低この間隔（m）に間引く（既定 0 = 全部）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PROP = arg('--property');
const MAPS = argv.flatMap((a, i) => (a === '--map' ? [argv[i + 1]] : []));
const GAP = Number(opt('gap', '0'));
const UPLOAD = argv.includes('--upload');
const OUT = arg('--out');
const MARGIN = Number(opt('margin', '2.5'));   // 地点の外側に残す幅（m）
const LONG = Number(opt('long', '1400'));      // 図の長い辺（px）
if (!PROP || !MAPS.length || !OUT) { console.error('usage: --property <id> --map "名前|英名|topdown.json" --out out.json'); process.exit(2); }
const ORIGIN = 'https://locahun3d.com';
const ART = path.resolve(import.meta.dirname, '../artifacts/photomap');
fs.mkdirSync(ART, { recursive: true });

let s3, BUCKET;
if (UPLOAD) {
  for (const n of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET']) {
    if (process.env[n] || process.platform !== 'win32') continue;
    const m = /REG_\w+\s+(.+)\s*$/m.exec(spawnSync('reg', ['query', 'HKCU\\Environment', '/v', n], { encoding: 'utf8' }).stdout || '');
    if (m) process.env[n] = m[1].trim();
  }
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
  BUCKET = process.env.R2_BUCKET;
}

const out = [];
for (const spec of MAPS) {
  const [label, labelEn, tdPath, extra = ''] = spec.split('|');   // extra: 図面の調整 "th=20,close=1.6"（photomap-plan.py の --th= 等）
  const td = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  // 公式の図面がある場所はそれを使う（2026-11-26 本人「元々図面があるところはそれを使ってくれ。ないところは作る」）
  //   extra に reg=<位置合わせ json> を書くと、図 = 公式図面（json の blueprint）、点 = 世界座標を json の変換で図面の画素へ。
  //   json: { blueprint: 画像, world2img: 2x3 アフィン（平面図）| H: 3x3 射影（斜めから見た立体図の床面）, crop: [x0,y0,x1,y1], dropOutside: 白地の点を外す }
  const regPath = (extra.split(',').find((kv) => kv.startsWith('reg=')) || '').slice(4);
  if (regPath) {
    const m = await fromBlueprint(label, labelEn, td, JSON.parse(fs.readFileSync(regPath, 'utf8')), path.dirname(regPath));
    // 同じ名前・同じ図面が続いたら 1 枚にまとめる（地点ごとに写真の場所 base を持たせる）
    const prev = out[out.length - 1];
    if (prev && prev.label === m.label && prev.image.src === m.image.src) prev.points.push(...m.points.map((q) => ({ ...q, base: m.photoBase })));
    else out.push(m);
    continue;
  }
  // 図: 既定は白地の簡易図面（scripts/photomap-plan.py。2026-11-26 本人「簡易図面にして 参考webのような」）。--photo で真上からの写真のまま
  let raw = tdPath.replace(/\.json$/, '_raw.png'), planBox = null;
  if (!argv.includes('--photo')) {
    const planPng = path.join(ART, path.basename(tdPath).replace(/\.json$/, '_plan.png'));
    const r = spawnSync('python', [path.join(import.meta.dirname, 'photomap-plan.py'), tdPath, planPng, ...extra.split(',').filter(Boolean).map((kv) => '--' + kv)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('photomap-plan failed: ' + r.stderr);
    raw = planPng; planBox = JSON.parse(fs.readFileSync(planPng + '.json', 'utf8')).bbox;
  }
  // 断面の図面（photomap-section.py の _sec.json）は描いてある範囲の全体を入れる
  if (td.section) {
    const { data, info } = await sharp(raw).greyscale().raw().toBuffer({ resolveWithObject: true });
    let a = info.width, b = info.height, c = 0, d = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 200) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
    planBox = [a, b, c, d];
  }
  const g = await (await fetch(`${ORIGIN}/api/pano/${td.key}.graph.json`)).json();
  // 写真ツアーで行ける地点だけ（つながりの無い地点は外す）
  const linked = new Set(g.edges.flat());
  let nodes = g.nodes.filter((n, i) => g.nodes.length < 3 || linked.has(i));
  if (GAP > 0 && nodes.length > 12) {   // 小さい部屋（12 地点以下）は全部残す
    const keep = [];
    for (const n of nodes) if (!keep.some((k) => Math.hypot(k.pos.x - n.pos.x, k.pos.z - n.pos.z) < GAP)) keep.push(n);
    nodes = keep;
  }
  // 最初に出す地点 = ツアーの開始位置にいちばん近い地点（先頭に置く）
  if (g.start) { const d = (n) => Math.hypot(n.pos.x - g.start.x, n.pos.z - g.start.z); const i0 = nodes.reduce((b, n, i) => (d(n) < d(nodes[b]) ? i : b), 0); nodes = [nodes[i0], ...nodes.filter((_, i) => i !== i0)]; }
  // 世界 → 元の図の画素
  // photomap-section.py が図を回したとき（td.rot、壁を縦横にそろえる）は地点も同じだけ回す
  const rc = Math.cos(td.rot || 0), rs = Math.sin(td.rot || 0), ro = td.rotOrigin || { x: 0, z: 0 };
  const rotP = (x, z) => [ro.x + rc * (x - ro.x) - rs * (z - ro.z), ro.z + rs * (x - ro.x) + rc * (z - ro.z)];
  const toPx = (x0, z0) => { const [x, z] = rotP(x0, z0); return [td.px / 2 + (x - td.center.x) * td.ppm, td.px / 2 + (z - td.center.z) * td.ppm]; };
  // 図の上を 0 とした時計回りの度（正面 (sin yaw, cos yaw) を同じだけ回す。回さないときは 180 - yaw° と同じ）
  const mapYaw = (y) => { const fx = Math.sin(y), fz = Math.cos(y); const a = (Math.atan2(rc * fx - rs * fz, -(rs * fx + rc * fz)) * 180) / Math.PI; return ((Math.round(a) % 360) + 540) % 360 - 180; };
  const P = nodes.map((n) => toPx(n.pos.x, n.pos.z));
  const m = MARGIN * td.ppm;
  let x0 = Math.max(0, Math.min(...P.map((p) => p[0])) - m), x1 = Math.min(td.px, Math.max(...P.map((p) => p[0])) + m);
  let y0 = Math.max(0, Math.min(...P.map((p) => p[1])) - m), y1 = Math.min(td.px, Math.max(...P.map((p) => p[1])) + m);
  // 簡易図面のときは図面の全体が入るように（地点のまわりだけだと壁が図の端で切れる）。外に 0.6m の余白
  if (planBox) { const e = 0.6 * td.ppm; x0 = Math.max(0, Math.min(planBox[0] - e, Math.min(...P.map((p) => p[0])) - e)); y0 = Math.max(0, Math.min(planBox[1] - e, Math.min(...P.map((p) => p[1])) - e)); x1 = Math.min(td.px, Math.max(planBox[2] + e, Math.max(...P.map((p) => p[0])) + e)); y1 = Math.min(td.px, Math.max(planBox[3] + e, Math.max(...P.map((p) => p[1])) + e)); }
  // 細長すぎる図は 2:1 まで広げる（点が小さい部屋でも図として読めるように）
  const w0 = x1 - x0, h0 = y1 - y0;
  if (w0 > 2 * h0) { const d = (w0 / 2 - h0) / 2; y0 = Math.max(0, y0 - d); y1 = Math.min(td.px, y1 + d); }
  if (h0 > 2 * w0) { const d = (h0 / 2 - w0) / 2; x0 = Math.max(0, x0 - d); x1 = Math.min(td.px, x1 + d); }
  const cw = Math.round(x1 - x0), ch = Math.round(y1 - y0);
  // 縮尺をそろえる: 1m = 45px を目安（小さい部屋を引き伸ばして線が太くならないように）。長い辺は 560〜LONG px
  const s = Math.min(LONG, Math.max(560, (Math.max(cw, ch) / td.ppm) * 45)) / Math.max(cw, ch);
  const W = Math.round(cw * s), H = Math.round(ch * s);
  const img = await sharp(raw).extract({ left: Math.round(x0), top: Math.round(y0), width: cw, height: ch }).resize(W, H).webp({ quality: 82 }).toBuffer();
  const hash = crypto.createHash('sha256').update(img).digest('hex').slice(0, 10);
  const file = `photomap-${PROP}-${hash}.webp`;
  fs.writeFileSync(path.join(ART, file), img);
  let src = `/api/r2/assets/image/${file}`;
  if (UPLOAD) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `assets/image/${file}`, Body: img, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
  }
  const r3 = (v) => Math.round(v * 10000) / 10000;
  out.push({
    label, labelEn,
    image: { src, width: W, height: H },
    photoBase: `/api/pano/${td.key}-g${g.set}-`,
    metersWide: Math.round((cw / td.ppm) * 100) / 100,   // 図の横幅（m）。画面の縮尺バーに使う
    // 線の形（photomap-vector.py）: 図の画素座標に直して渡す。画面は SVG で描く
    ...(td.geom ? { plan: (() => {
      const X = (v) => Math.round((v - x0) * (W / cw) * 10) / 10, Y = (v) => Math.round((v - y0) * (H / ch) * 10) / 10;
      const xy = (a) => a.map((v, j) => (j % 2 ? Y(v) : X(v)));
      return { outer: td.geom.outer.map(xy), dashed: td.geom.dashed.map(xy), walls: td.geom.walls.map(xy), furn: td.geom.furn.map(xy), flines: (td.geom.flines || []).map(xy), labels: (td.geom.labels || []).map(([x, y, t, te, k = 1]) => [X(x), Y(y), t, te, k]),
        cols: td.geom.cols.map(([a, b, w, h]) => [X(a), Y(b), Math.round(w * (W / cw) * 10) / 10, Math.round(h * (H / ch) * 10) / 10]) };
    })() } : {}),
    // yaw: 地点の向き（ビューアーの yaw。正面は図の上で (sin yaw, cos yaw)）→ 図の上を 0 とした時計回りの度 = 180 - yaw°
    //   （TK n1 で確かめた: 正面が北の壁、右が東の丸いバー）
    points: nodes.map((n, i) => ({ id: n.id, x: r3((P[i][0] - x0) / cw), y: r3((P[i][1] - y0) / ch), yaw: mapYaw(n.yaw || 0) })),
  });
  console.log(label, 'points', nodes.length, '/', g.nodes.length, 'image', `${W}x${H}`, UPLOAD ? 'uploaded' : 'local', file);
}
async function graphNodes(td, noGap = false) {
  const g = await (await fetch(`${ORIGIN}/api/pano/${td.key}.graph.json`)).json();
  const linked = new Set(g.edges.flat());
  let nodes = g.nodes.filter((n, i) => g.nodes.length < 3 || linked.has(i));
  if (!noGap && GAP > 0 && nodes.length > 12) { const keep = []; for (const n of nodes) if (!keep.some((k) => Math.hypot(k.pos.x - n.pos.x, k.pos.z - n.pos.z) < GAP)) keep.push(n); nodes = keep; }
  if (g.start) { const d = (n) => Math.hypot(n.pos.x - g.start.x, n.pos.z - g.start.z); const i0 = nodes.reduce((b, n, i) => (d(n) < d(nodes[b]) ? i : b), 0); nodes = [nodes[i0], ...nodes.filter((_, i) => i !== i0)]; }
  return { g, nodes };
}

async function fromBlueprint(label, labelEn, td, reg, dir) {
  // select: 図に出す地点（photomap-rooms.py が部屋ごとの真ん中に選んだもの）。あれば間引き（--gap）はしない
  const select = reg.select ? new Set(JSON.parse(fs.readFileSync(path.resolve(dir, reg.select), 'utf8')).select) : null;
  const { g, nodes: all } = await graphNodes(td, !!select);
  const nodes = select ? all.filter((n) => select.has(n.id)) : all;
  const T = reg.H
    ? (x, z) => { const h = reg.H, w = h[2][0] * x + h[2][1] * z + h[2][2]; return [(h[0][0] * x + h[0][1] * z + h[0][2]) / w, (h[1][0] * x + h[1][1] * z + h[1][2]) / w]; }
    : (x, z) => { const m = reg.world2img; return [m[0][0] * x + m[0][1] * z + m[0][2], m[1][0] * x + m[1][1] * z + m[1][2]]; };
  const bpFile = path.resolve(dir, reg.blueprint);
  const meta = await sharp(bpFile).metadata();
  const [x0, y0, x1, y1] = reg.crop || [0, 0, meta.width, meta.height];
  const cw = x1 - x0, ch = y1 - y0;
  // shifts: スキャン同士のずれを場所ごとに直す [{ zmax?, zmin?, xmin?, xmax?, dx, dz }]（世界 m。図面の廊下に合わせる）
  const at = (n) => { let x = n.pos.x, z = n.pos.z; for (const sh of reg.shifts || []) if ((sh.zmax == null || n.pos.z < sh.zmax) && (sh.zmin == null || n.pos.z >= sh.zmin) && (sh.xmin == null || n.pos.x >= sh.xmin) && (sh.xmax == null || n.pos.x < sh.xmax)) { x += sh.dx || 0; z += sh.dz || 0; } return [x, z]; };
  let keep = nodes.map((n) => ({ n, p: T(...at(n)) })).filter(({ p }) => p[0] >= x0 && p[0] < x1 && p[1] >= y0 && p[1] < y1);
  // dropBoxes: 図面で人が入らない所（階段・設備室）に落ちた点を外す [x0,y0,x1,y1]（元の図面の画素）
  for (const [a, b, c, d] of reg.dropBoxes || []) keep = keep.filter(({ p }) => !(p[0] >= a && p[0] < c && p[1] >= b && p[1] < d));
  if (reg.dropOutside) {   // 図面の建物の外（白地）に落ちた点は出さない
    const { data, info } = await sharp(bpFile).greyscale().raw().toBuffer({ resolveWithObject: true });
    const white = (u, v) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const q = data[Math.min(info.height - 1, Math.max(0, Math.round(v) + dy)) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(u) + dx))]; if (q < 245) return false; } return true; };
    const before = keep.length; keep = keep.filter(({ p }) => !white(p[0], p[1])); if (keep.length < before) console.log(label, 'dropped outside the plan', before - keep.length);
  }
  const W = Math.min(LONG, cw), H = Math.round(ch * (W / cw));
  // whiteout: 図面の外の文字（物件情報の欄のはみ出し等）を白で消す [x0,y0,x1,y1]（元の図面の画素）
  const wo = (reg.whiteout || []).map(([a, b, c, d]) => ({ input: { create: { width: c - a, height: d - b, channels: 3, background: '#ffffff' } }, left: a, top: b }));
  const base0 = wo.length ? await sharp(bpFile).composite(wo).png().toBuffer() : bpFile;
  const img = await sharp(base0).extract({ left: x0, top: y0, width: cw, height: ch }).resize(W, H).webp({ quality: 88 }).toBuffer();
  const hash = crypto.createHash('sha256').update(img).digest('hex').slice(0, 10);
  const file = `photomap-${PROP}-${hash}.webp`;
  fs.writeFileSync(path.join(ART, file), img);
  if (UPLOAD) { const { PutObjectCommand } = require('@aws-sdk/client-s3'); await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `assets/image/${file}`, Body: img, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' })); }
  const r3 = (v) => Math.round(v * 10000) / 10000;
  // 向き: 正面 (sin yaw, cos yaw) を図面の上に写した向き（図の上 = 0、時計回り）
  // views: 最初に見せる向き（photomap-bestview.py の出力。正面から時計回りの度）。矢印もその向きにする
  const views = reg.views ? JSON.parse(fs.readFileSync(path.resolve(dir, reg.views), 'utf8')) : {};
  const dirOf = (n) => { const fx = Math.sin(n.yaw || 0), fz = Math.cos(n.yaw || 0), t = ((views[n.id] || 0) * Math.PI) / 180; return [Math.cos(t) * fx - Math.sin(t) * fz, Math.cos(t) * fz + Math.sin(t) * fx]; };
  const yawOf = (n, p) => { const e = 0.3, [ax, az] = at(n), [vx, vz] = dirOf(n), q = T(ax + e * vx, az + e * vz); const a = (Math.atan2(q[0] - p[0], -(q[1] - p[1])) * 180) / Math.PI; return ((Math.round(a) % 360) + 540) % 360 - 180; };
  console.log(label, 'blueprint points', keep.length, '/', g.nodes.length, 'image', `${W}x${H}`, UPLOAD ? 'uploaded' : 'local', file);
  return {
    label, labelEn,
    image: { src: `/api/r2/assets/image/${file}`, width: W, height: H },
    photoBase: `/api/pano/${td.key}-g${g.set}-`,
    ...(reg.metersWide ? { metersWide: reg.metersWide } : {}),
    points: keep.map(({ n, p }) => ({ id: n.id, x: r3((p[0] - x0) / cw), y: r3((p[1] - y0) / ch), yaw: yawOf(n, p), ...(views[n.id] ? { o: views[n.id] } : {}) })),
  };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote', OUT);
