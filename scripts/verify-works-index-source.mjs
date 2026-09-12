import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
// Run the actual importer conversion without its full-directory delete/write step.
// This protects concurrent, uncommitted article edits while checking index parity.
const directory = path.resolve('scripts');
const source = fs.readFileSync(path.join(directory, 'import-works.mjs'), 'utf8')
  .split('// ── 実行 ─')[0]
  .replace('const HERE = dirname(fileURLToPath(import.meta.url));', `const HERE = ${JSON.stringify(directory)};`);
const { convert } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { convert };').toString('base64'));
for (const locale of ['ja', 'en']) {
  const input = path.resolve('../digiroke3d_Web', locale === 'ja' ? 'works/index.html' : 'en/works/index.html');
  const actual = JSON.parse(fs.readFileSync(`content/works/${locale}/index.json`, 'utf8'));
  assert.deepEqual(actual, convert(input, locale));
  console.log(`PASS ${locale}/index.json matches actual importer output; other article files untouched`);
}
