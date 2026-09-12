import fs from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Render real state-page JSX with isolated, read-only mocks. No auth/DB calls.
const out = 'artifacts/form-state-rhythm';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3032/unsubscribe', { waitUntil: 'networkidle' });
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(ns => ns.map(n => n.href));
  const css = (await Promise.all(styles.map(async u => (await page.request.get(u)).text()))).join('\n');
  for (const route of ['onboarding', 'preview/[token]', 's/[token]']) {
    const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' }, stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/app/${route}/page.tsx';const node=await Page({params:Promise.resolve({token:'fixture'}),searchParams:Promise.resolve({intent:'studio'})});createRoot(document.getElementById('root')).render(node);` }, plugins: [{ name: 'safe-state-fixture', setup(b) {
      b.onResolve({ filter: /^(?:@\/|next\/)/ }, a => {
        if (a.path === '@/lib/i18n/dictionaries' || a.path === '@/lib/listing-funnel') return;
        const source = ts.createSourceFile(a.importer, fs.readFileSync(a.importer, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const names = [];
        for (const s of source.statements) if (ts.isImportDeclaration(s) && s.moduleSpecifier.text === a.path) {
          const bindings = s.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) for (const e of bindings.elements) if (!e.isTypeOnly) names.push((e.propertyName ?? e.name).text);
        }
        return { path: a.path, namespace: 'stub', pluginData: { names } };
      });
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => {
        const value = n => n === 'getLocale' ? 'async()=>window.fixtureLocale' : n === 'requireUser' ? 'async()=>user' : n === 'isPreviewExpired' ? '()=>true' : n === 'getPublishedProperties' ? 'async()=>[]' : n === 'localizeProperty' ? 'p=>p' : /Repo$/.test(n) || n === 'repo' ? 'fixtureRepo' : '()=>{}';
        return { loader: 'jsx', resolveDir: process.cwd(), contents: `const user={id:'fixture',name:'表示確認',role:'individual',onboarded:false,bookmarkFolders:[{id:'fixture',name:'表示確認用の共有ボード'}],bookmarkFolderAssignments:{}};const fixtureRepo={get:async()=>({...user,folderId:'fixture',userId:'fixture'})};export default function Empty({children,...props}){return ${a.path === 'next/link' ? '<a {...props}>{children}</a>' : 'null'}};${a.pluginData.names.map(n => `export const ${n}=${value(n)};`).join('\n')}` };
      });
    } }] });
    for (const locale of ['ja', 'en']) for (const width of [1440, 820, 390]) {
      await page.goto('about:blank');
      await page.setViewportSize({ width, height: 1000 });
      await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body class="theme-online"><div id="root"></div></body></html>`);
      await page.evaluate(l => { window.fixtureLocale = l; window.fetch = () => { throw Error('Fixture network forbidden'); }; }, locale);
      await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0].text });
      await page.locator('h1').waitFor();
      const metrics = await page.locator('h1').evaluate(el => ({ title: el.textContent, size: getComputedStyle(el).fontSize, line: getComputedStyle(el).lineHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
      results.push({ route, locale, width, ...metrics });
      await page.screenshot({ path: `${out}/${route.replaceAll('/', '-').replaceAll('[', '').replaceAll(']', '')}-${locale}-${width}.png` });
    }
  }
} finally {
  await browser.close();
  fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results));
if (results.some(r => r.overflow)) process.exitCode = 1;
