// 本番の全物件・全シーンについて、写真ツアーの部品（2D 画像 .json・動線グラフ .graph.json）が揃っているかを一覧にする（2026-11-25）。
//   本人「２Dイメージから進めないが？？ 全部の物件本番確認して」。シェアキッチンは .graph.json が無く 2D で進めなかった。
//   node scripts/tour-inventory.mjs [--json out.json]
import crypto from 'node:crypto';
import fs from 'node:fs';
const ORIGIN = 'https://locahun3d.com';
const txt = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.text(); };
const html = await txt(ORIGIN + '/properties');
const slugs = [...new Set([...html.matchAll(/href="\/properties\/([^"/?#]+)"/g)].map((m) => m[1]))];
const rows = [];
async function one(slug) {
  const ph = await txt(`${ORIGIN}/properties/${slug}`).catch(() => '');
  const scenes = [...new Set([...ph.matchAll(/offline-viewer\.html\?autoload=([^"&]+)/g)].map((m) => new URLSearchParams('a=' + m[1]).get('a')))].filter((s) => s.startsWith('/api/viewer-stream/'));
  for (const scene of scenes) {
    const h = await fetch(ORIGIN + encodeURI(scene), { method: 'HEAD' });
    const etag = (h.headers.get('etag') || '').replace(/"/g, ''), len = h.headers.get('content-length');
    const key = crypto.createHash('sha256').update(`l3d-pano-v1:etag:${etag}:${len}`).digest('hex');
    const meta = await fetch(`${ORIGIN}/api/pano/${key}.json`).then((r) => r.ok ? r.json() : null).catch(() => null);
    const g = await fetch(`${ORIGIN}/api/pano/${key}.graph.json`).then((r) => r.ok ? r.json() : null).catch(() => null);
    const nodes = g?.nodes?.length ?? 0;
    const startNb = g ? (g.startNb || g.start?.nb || []).length : 0;
    rows.push({ slug, scene, key, pano: !!meta, graph: !!g, nodes, startNb, audit: g?.audit ? { cov: g.audit.coverage, comp: g.audit.components } : null });
  }
}
const q = [...slugs];
await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) await one(q.shift()).catch((e) => rows.push({ slug: '?', err: String(e) })); }));
rows.sort((a, b) => (a.slug || '').localeCompare(b.slug || ''));
for (const r of rows) {
  const flag = r.err ? 'ERR ' : !r.pano ? 'NOPANO' : !r.graph ? 'NOGRAPH' : r.nodes < 3 ? 'FEW' : 'ok';
  console.log(flag.padEnd(8), (r.slug || '').padEnd(30), String(r.nodes).padStart(4), (r.scene || r.err || '').split('/').pop().slice(0, 70), r.key ? r.key.slice(0, 12) : '');
}
const ng = rows.filter((r) => r.err || !r.pano || !r.graph || r.nodes < 3);
console.log(`\n${rows.length} シーン / 物件 ${slugs.length} / 要対応 ${ng.length}`);
const out = process.argv[process.argv.indexOf('--json') + 1];
if (process.argv.includes('--json') && out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
