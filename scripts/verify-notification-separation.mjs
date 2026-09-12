import fs from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Isolated real UI fixtures. All DAL, notification reads and server actions are
// replaced at module boundaries. No authentication, database or network writes.
const out = 'artifacts/notification-separation';
fs.mkdirSync(out, { recursive: true });
const notices = [
  { id: 'u1', userId: 'fixture', type: 'inquiry_reply', title: 'お問い合わせへの返信 / Inquiry reply', body: '本人向けの返信です。', link: '/properties/fixture', read: false, createdAt: '2026-09-12T01:00:00Z' },
  { id: 'a1', userId: 'fixture', type: 'publish_request', title: '公開申請 / Publication request', body: '管理者向けの申請です。', link: '/admin/properties/fixture/edit', read: false, createdAt: '2026-09-12T01:00:00Z' },
];
const bundle = await build({ bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' }, stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `import React from 'react';import{createRoot}from'react-dom/client';import Bell from './src/components/notification-bell';import List from './src/components/account/notification-list';import AdminPage from './src/app/admin/notifications/page';import AdminLayout from './src/app/admin/layout';import{notificationScope}from './src/lib/notification-scope';const locale=window.fixtureLocale;const personal=${JSON.stringify(notices)}.filter(n=>notificationScope(n)==='user');const node=window.fixtureAdmin?await AdminLayout({children:await AdminPage()}):<main className="theme-online frame ui-page-shell"><div className="flex justify-end mb-8"><Bell notifications={personal} unreadCount={41} locale={locale} en={locale==='en'}/></div><List notifications={personal} unreadCount={41} locale={locale} en={locale==='en'}/></main>;createRoot(document.getElementById('root')).render(node);` }, plugins: [{ name: 'no-network-fixture', setup(b) {
  b.onResolve({ filter: /^(@\/lib\/(dal|notifications|notification-actions|i18n\/server)|next\/)/ }, a => ({ path: a.path, namespace: 'stub' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, a => {
    let contents;
    if (a.path === 'next/link') contents = 'export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}';
    else if (a.path === 'next/navigation') contents = 'export const usePathname=()=>window.fixtureLocale==="en"?"/en/admin/notifications":"/admin/notifications";';
    else if (a.path.endsWith('/dal')) contents = 'export const requireAdmin=async()=>({id:"fixture",role:"admin"});export const requireAdminOrStudioOwner=requireAdmin;';
    else if (a.path.endsWith('/notifications')) contents = `import{notificationScope}from './src/lib/notification-scope';export const getNotificationSummary=async(id,scope,limit=30)=>({notifications:${JSON.stringify(notices)}.filter(n=>n.userId===id&&notificationScope(n)===scope).slice(0,limit),unreadCount:scope==='admin'?7:41});`;
    else if (a.path.endsWith('/notification-actions')) contents = 'export async function markNotificationsReadAction(scope){window.fixtureCalls.push(scope);if(window.fixtureReadFailure)throw Error("fixture read failure")}';
    else contents = 'export const getLocale=async()=>window.fixtureLocale;';
    return { contents, loader: 'jsx', resolveDir: process.cwd() };
  });
} }] });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const results = [];
try {
  const page = await browser.newPage();
  await page.goto('http://localhost:3032/contact', { waitUntil: 'networkidle' });
  const links = await page.locator('link[rel="stylesheet"]').evaluateAll(ns => ns.map(n => n.href));
  const css = (await Promise.all(links.map(async u => (await page.request.get(u)).text()))).join('\n');
  for (const locale of ['ja', 'en']) for (const width of [1440, 820, 390]) for (const admin of [false, true]) {
    await page.goto('about:blank'); await page.setViewportSize({ width, height: 1000 });
    await page.setContent(`<!doctype html><html lang="${locale}"><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
    await page.evaluate(({locale,admin}) => { window.fixtureLocale=locale;window.fixtureAdmin=admin;window.fixtureCalls=[];window.fetch=()=>{throw Error('Network disabled in fixture')}; }, {locale,admin});
    await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0].text });
    await page.locator(admin ? '#admin-notifications' : '#notifications').waitFor();
    const body = await page.locator('body').innerText();
    if (admin ? (body.includes('Inquiry reply') || !body.includes('Publication request')) : (body.includes('Publication request') || !body.includes('Inquiry reply'))) throw Error('Wrong notification scope rendered');
    if (admin && !(await page.locator('nav').innerText()).includes('(7)')) throw Error('Admin entry unread count missing');
    if (!admin) {
      await page.getByRole('button', { name: locale === 'en' ? 'Notifications (41 unread)' : '通知（未読41件）', exact: true }).click();
      if ((await page.locator('body').innerText()).includes('Publication request')) throw Error('Admin body leaked into bell');
    }
    await page.screenshot({ path: `${out}/${locale}-${width}-${admin?'admin':'user'}.png`, fullPage: true });
    const readButtons = page.getByRole('button', { name: locale === 'en' ? 'Mark all read' : /すべて既読/ });
    await page.evaluate(() => { window.fixtureReadFailure = true; });
    await readButtons.first().click();
    await page.getByRole('alert').first().waitFor();
    const calls = await page.evaluate(() => window.fixtureCalls);
    if (calls.length !== 1 || calls[0] !== (admin ? 'admin' : 'user')) throw Error('Wrong mark-read scope');
    if (!admin && !(await page.getByRole('button', { name: locale === 'en' ? 'Notifications (41 unread)' : '通知（未読41件）', exact: true }).count())) throw Error('Failed action erased unread badge');
    const geometry = await page.evaluate(() => {
      const h = document.querySelector('h1')?.getBoundingClientRect();
      const a = document.querySelector('aside')?.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, titleCovered: !!h && !!a && h.left < a.right && h.right > a.left && h.top < a.bottom && h.bottom > a.top };
    });
    if (geometry.titleCovered) throw Error('Admin navigation covers heading');
    results.push({ locale, width, admin, calls, ...geometry });
  }
} finally { await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)); }
console.log(JSON.stringify(results));
if(results.some(r=>r.overflow))process.exitCode=1;
