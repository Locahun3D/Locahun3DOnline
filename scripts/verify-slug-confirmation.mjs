import fs from 'node:fs';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const out = 'F:/Codex/online-purchase-review-20260912';
fs.mkdirSync(out, { recursive: true });
const bundle = await build({
  bundle: true, write: false, platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json',
  stdin: { loader: 'jsx', resolveDir: process.cwd(), contents: `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import SlugEditor from './src/components/admin/slug-editor';
    window.writes=0; window.confirmations=0;
    function App(){const [date,setDate]=useState('');return <form onSubmit={e=>e.preventDefault()}><SlugEditor id="shibuyasq" status="draft" embedded urlConfirmedAt={date} onConfirmed={date=>{window.confirmations++;setDate(date)}} /></form>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` },
  plugins: [{ name: 'no-server-writes', setup(b) {
    b.onResolve({filter:/^@\/app\/admin\/_actions$/},()=>({path:'actions',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/(preview-share|embed-share)$/},()=>({path:'empty',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='actions'
      ? 'export async function renamePropertyAction(){throw new Error("Unexpected rename")};export async function confirmPropertySlugAction(){window.writes++}'
      : 'export default function Empty(){return null}'}));
  }}],
});
const browser = await chromium.launch({channel:'chrome',headless:false});
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3032/sign-in', {waitUntil:'networkidle'});
  const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(ns=>ns.map(n=>n.href));
  assert(styles.length);
  for(const width of [1440,820,390]) {
    await page.setViewportSize({width,height:900});
    await page.setContent(`<html><head>${styles.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}<style>html{zoom:1!important}</style></head><body class="theme-online"><main style="padding:24px;max-width:1200px;margin:auto"><div id="root"></div></main></body></html>`);
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button',{name:'このURLでよい'}).click();
    await page.getByText('✓ 確認済み').waitFor();
    assert.deepEqual(await page.evaluate(()=>[window.writes,window.confirmations]),[0,1]);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`${out}/url-confirmation-${width}.png`});
  }
  console.log('PASS actual SlugEditor: one parent update, zero independent server writes, 1440/820/390. Isolated component, not authenticated editor persistence.');
} finally {await browser.close()}
