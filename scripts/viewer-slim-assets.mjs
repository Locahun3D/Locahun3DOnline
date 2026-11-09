// Moves the three large, lazily used base64 payloads out of the online viewer HTML
// into immutable sidecar files, so the page the site serves is ~2 MB instead of ~7 MB.
//
//   node scripts/viewer-slim-assets.mjs            split full HTML(s) in place (idempotent)
//   node scripts/viewer-slim-assets.mjs --check    verify slim HTML(s) + sidecars rebuild the full build
//
// Payloads (all already had an HTTP descriptor path in the viewer runtime):
//   WALK_RAPIER_B64        -> WALK_RAPIER_ASSET  /vendor/rapier-0.20.0-09a000bee2ad8276.mjs (path + hash fixed by the runtime)
//                             (+ /viewer/figures/rapier-embedded-v1-<sha256>.mjs, the exact embedded bytes, ZIP export only)
//   equipment-assets JSON  -> descriptor JSON    /viewer/figures/equipment-models-v1-<sha256>.json
//   MIXAMO_GLB_B64         -> MIXAMO_GLB_ASSET   /viewer/figures/mixamo-model-v1-<sha256>.glb
//
// The full single-file viewer is still what a saved ZIP contains: the page carries a
// manifest (window.__locahunSlimAssets) and _inlineSlimAssetsForZip() rebuilds the
// exact original bytes (checked against fatSha256) before bundling.
//
// Run this after any change to public/viewer/offline-viewer.html or scene-editor.html
// that brings back a full (embedded) build. Never run a viewer sync over these files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const HTMLS = ['public/viewer/offline-viewer.html', 'public/viewer/scene-editor.html'];
const CHECK = process.argv.includes('--check');
const RAPIER = { url: '/vendor/rapier-0.20.0-09a000bee2ad8276.mjs', bytes: 2857590,
  sha256: '09a000bee2ad827608780cf8821258cadc243aaeb8881ab3e769de73f945eee0' };
const MANIFEST_RE = /<script id="locahun-slim-assets">window\.__locahunSlimAssets=([^<]*)<\/script>\n/;

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');
const fail = (m) => { console.error('FATAL: ' + m); process.exit(1); };

// Each payload is one whole line: before + PAYLOAD + after.
const SPECS = [
  { id: 'rapier', encoding: 'base64', before: 'window.WALK_RAPIER_B64 = "', after: '";',
    // The embedded copy is the pinned module minus its sourceMappingURL comment, so the
    // runtime loads the pinned file and only ZIP export fetches this exact copy.
    sidecar: (bytes) => `/viewer/figures/rapier-embedded-v1-${sha(bytes)}.mjs`,
    slim: () => `globalThis.WALK_RAPIER_ASSET = Object.freeze(${JSON.stringify(RAPIER)});` },
  { id: 'equipment', encoding: 'text', before: '<script type="application/json" id="equipment-assets">', after: '</script>',
    sidecar: (bytes) => `/viewer/figures/equipment-models-v1-${sha(bytes)}.json`,
    slim: (d) => `<script type="application/json" id="equipment-assets">${scriptJson({ version: 1, url: d.url, sha256: d.sha256, bytes: d.bytes })}</script>` },
  { id: 'mixamo', encoding: 'base64', before: '<script>window.MIXAMO_GLB_B64="', after: '";</script>',
    sidecar: (bytes) => `/viewer/figures/mixamo-model-v1-${sha(bytes)}.glb`,
    slim: (d) => `<script>window.MIXAMO_GLB_ASSET=${scriptJson({ version: 1, url: d.url, sha256: d.sha256, bytes: d.bytes })};</script>` },
];

function findLine(html, before, after) {
  const start = html.indexOf('\n' + before);
  if (start < 0) return null;
  const s = start + 1, e = html.indexOf('\n', s);
  const line = html.slice(s, e);
  if (!line.endsWith(after) || html.indexOf('\n' + before, e) >= 0) fail('payload line not unique/ill-formed: ' + before);
  return { s, e, payload: line.slice(before.length, line.length - after.length) };
}

function rebuild(slimHtml, manifest) {
  const tag = slimHtml.match(MANIFEST_RE);
  let html = slimHtml.replace(tag[0], () => '');
  for (const entry of manifest.entries) {
    const bytes = fs.readFileSync(path.join(PUBLIC, entry.url));
    if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) fail('sidecar mismatch ' + entry.url);
    const payload = entry.encoding === 'base64' ? bytes.toString('base64') : bytes.toString('utf8');
    if (html.split(entry.slim).length !== 2) fail('slim line not unique ' + entry.url);
    html = html.replace(entry.slim, () => entry.before + payload + entry.after);
  }
  return Buffer.from(html, 'utf8');
}

// The runtime-pinned Rapier module (copy of Locahun3D/vendor/rapier-walk/rapier.mjs).
{
  const p = path.join(PUBLIC, RAPIER.url);
  if (!fs.existsSync(p)) fail('missing ' + RAPIER.url + ' (copy Locahun3D/vendor/rapier-walk/rapier.mjs)');
  const b = fs.readFileSync(p);
  if (b.length !== RAPIER.bytes || sha(b) !== RAPIER.sha256) fail(RAPIER.url + ' does not match the runtime pin');
}

for (const rel of HTMLS) {
  const file = path.join(ROOT, rel);
  const raw = fs.readFileSync(file);
  const html = raw.toString('utf8');
  if (!Buffer.from(html, 'utf8').equals(raw)) fail(rel + ' is not valid UTF-8');
  if (html.includes('\r\n')) fail(rel + ' has CRLF line endings (check .gitattributes)');
  const existing = html.match(MANIFEST_RE);

  if (existing) {
    const manifest = JSON.parse(existing[1]);
    const full = rebuild(html, manifest);
    if (full.length !== manifest.fatBytes || sha(full) !== manifest.fatSha256) fail(rel + ': rebuilt full HTML does not match fatSha256');
    console.log(`OK ${rel}: slim ${raw.length} B, rebuilds full ${full.length} B (${manifest.fatSha256.slice(0, 12)})`);
    continue;
  }
  if (CHECK) fail(rel + ' is not slim');

  const entries = [];
  let out = html;
  for (const spec of SPECS) {
    const hit = findLine(out, spec.before, spec.after);
    if (!hit) fail(`${rel}: ${spec.id} payload not found`);
    const bytes = spec.encoding === 'base64' ? Buffer.from(hit.payload, 'base64') : Buffer.from(hit.payload, 'utf8');
    if (spec.encoding === 'base64' && bytes.toString('base64') !== hit.payload) fail(spec.id + ' base64 is not canonical');
    const url = spec.sidecar(bytes);
    const target = path.join(PUBLIC, url);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(bytes)) fail('different sidecar already at ' + url);
    fs.writeFileSync(target, bytes);
    const d = { url, bytes: bytes.length, sha256: sha(bytes) };
    const slim = spec.slim(d);
    out = out.slice(0, hit.s) + slim + out.slice(hit.e);
    entries.push({ id: spec.id, ...d, encoding: spec.encoding, before: spec.before, after: spec.after, slim });
  }
  const manifest = { version: 1, fatBytes: raw.length, fatSha256: sha(raw), entries };
  // Directly after the Mixamo line (its slim form is unique).
  const anchor = entries[2].slim + '\n';
  out = out.replace(anchor, () => anchor + `<script id="locahun-slim-assets">window.__locahunSlimAssets=${scriptJson(manifest)}</script>\n`);
  const check = rebuild(out, manifest);
  if (!check.equals(raw)) fail(rel + ': round trip failed');
  fs.writeFileSync(file, out);
  console.log(`split ${rel}: ${raw.length} -> ${Buffer.byteLength(out)} B`);
}
