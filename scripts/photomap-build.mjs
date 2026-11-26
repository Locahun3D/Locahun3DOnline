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
  // 図: 既定は白地の簡易図面（scripts/photomap-plan.py。2026-11-26 本人「簡易図面にして 参考webのような」）。--photo で真上からの写真のまま
  let raw = tdPath.replace(/\.json$/, '_raw.png'), planBox = null;
  if (!argv.includes('--photo')) {
    const planPng = path.join(ART, path.basename(tdPath).replace(/\.json$/, '_plan.png'));
    const r = spawnSync('python', [path.join(import.meta.dirname, 'photomap-plan.py'), tdPath, planPng, ...extra.split(',').filter(Boolean).map((kv) => '--' + kv)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('photomap-plan failed: ' + r.stderr);
    raw = planPng; planBox = JSON.parse(fs.readFileSync(planPng + '.json', 'utf8')).bbox;
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
  const toPx = (x, z) => [td.px / 2 + (x - td.center.x) * td.ppm, td.px / 2 + (z - td.center.z) * td.ppm];
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
  const s = LONG / Math.max(cw, ch);
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
    // yaw: 地点の向き（ビューアーの yaw。正面は図の上で (sin yaw, cos yaw)）→ 図の上を 0 とした時計回りの度 = 180 - yaw°
    //   （TK n1 で確かめた: 正面が北の壁、右が東の丸いバー）
    points: nodes.map((n, i) => ({ id: n.id, x: r3((P[i][0] - x0) / cw), y: r3((P[i][1] - y0) / ch), yaw: ((Math.round(180 - ((n.yaw || 0) * 180) / Math.PI) % 360) + 540) % 360 - 180 })),
  });
  console.log(label, 'points', nodes.length, '/', g.nodes.length, 'image', `${W}x${H}`, UPLOAD ? 'uploaded' : 'local', file);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote', OUT);
