import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const source = fs.readFileSync('src/components/admin/property-editor.tsx', 'utf8');
const out = 'F:/Codex/extended-pricing-20260912';
fs.mkdirSync(out, { recursive: true });
// Extract the live production functions verbatim; no copied implementation or server writes.
const functions = source.slice(source.indexOf('function LicenseOptionsEditor('), source.indexOf('/** ISO →'));
const presets = source.match(/const SALE_PRICE_PRESETS = .*?;/s)[0];
const inputClass = source.match(/const inputClass =[\s\S]*?;/)[0];
const bundle = await build({ bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', stdin: {
  resolveDir: process.cwd(), loader: 'tsx', contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useForm} from 'react-hook-form';
import {DATA_LICENSES, DATA_LICENSE_LABEL, DATA_LICENSE_DESC} from './src/lib/schemas';
import {applyExtendedLicensePricing} from './src/lib/license-options';
${presets}\n${inputClass}\n${functions}
function Fixture(){const {watch,setValue}=useForm({defaultValues:{splatItems:[{licenseOptions:[{license:'standard',price:5000},{license:'extended',price:0}]}]}});return <main className="p-4 max-w-4xl mx-auto"><h1>販売ライセンス価格の確認</h1><LicenseOptionsEditor idx={0} watch={watch} setValue={setValue}/><output hidden>{JSON.stringify(watch('splatItems.0.licenseOptions'))}</output></main>}
createRoot(document.getElementById('fixture')).render(<Fixture/>);` }, logLevel: 'silent' });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  for (const width of [1440, 820, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://localhost:3032', { waitUntil: 'domcontentloaded' });
    const cssLinks = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href));
    assert(cssLinks.length, 'production stylesheets must be present');
    const css = (await Promise.all(cssLinks.map(async url => (await page.request.get(url)).text()))).join('\n');
    await page.goto('about:blank');
    page.on('pageerror', error => console.error(error.message));
    await page.setContent('<html><head><style>' + css + '</style></head><body><div class="theme-online min-h-screen" id="fixture"></div></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const extended = page.getByText('拡張ライセンス', { exact: true }).locator('xpath=../../..');
    await page.getByText('¥10,000', { exact: true }).waitFor();
    assert.equal(await extended.locator('input[type=number], select').count(), 0);
    await page.screenshot({ path: path.join(out, `before-${width}.png`) });
    await page.locator('input[type=number]').fill('8000');
    await extended.getByText('¥16,000', { exact: true }).waitFor();
    const saved = JSON.parse(await page.locator('output').textContent());
    assert.deepEqual(saved, [{ license: 'standard', price: 8000 }, { license: 'extended', price: 16000 }]);
    assert(await page.locator('main').evaluate(main => [...main.querySelectorAll('input,select,label,p')].every(el => {const r=el.getBoundingClientRect();return r.left >= 0 && r.right <= window.innerWidth + 1;})), 'no controls outside viewport');
    await page.screenshot({ path: path.join(out, `after-${width}.png`) });
    console.log(`PASS real production editor, headed Chrome ${width}: 5000/10000 -> 8000/16000; form state follows, no overflow`);
    await page.close();
  }
} finally { await browser.close(); }
