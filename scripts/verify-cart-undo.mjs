import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const out = `${root}artifacts/cart-undo-20260912`;
await mkdir(out, { recursive: true });
const data = JSON.parse(await readFile(`${root}data/properties.json`, "utf8"));
const property = data.properties.find(p => p.id === "wh-002");
const cart = property.splatItems.map((i, index) => ({ propertyId: property.id, splatItemIndex: index, title: property.title, label: i.label, price: i.salePrice, license: i.license }));
const browser = await chromium.launch({ channel: "chrome", headless: false });
const results = [];
try {
  for (const en of [false, true]) for (const width of [1440, 820, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(cart => localStorage.setItem("locahun3d:cart:v1", JSON.stringify(cart)), cart);
    await page.goto(`http://localhost:3032/${en ? "en/" : ""}cart`, { waitUntil: "networkidle" });
    await page.getByRole("region", { name: en ? "Included downloads" : "購入に含まれるデータ" }).first().waitFor();
    const remove = page.getByRole("button", { name: en ? "Remove" : "削除", exact: true });
    const undo = page.getByRole("button", { name: en ? "Undo" : "元に戻す", exact: true });
    await remove.first().click();
    await remove.first().click();
    if (await remove.count()) throw new Error("Removal did not empty the cart");
    await undo.waitFor();
    await page.screenshot({ path: `${out}/empty-${en ? "en" : "ja"}-${width}.png`, fullPage: true });
    await undo.click(); await undo.click();
    if (await remove.count() !== cart.length) throw new Error("Undo did not restore both items");
    await page.getByRole("region", { name: en ? "Included downloads" : "購入に含まれるデータ" }).first().waitFor();
    const usage = page.getByRole("link", { name: en ? "How to use the data" : "データの活用方法について" });
    if (!(await usage.getAttribute("href")).endsWith("works/index.html#blog")) throw new Error("Missing usage link");
    const text = await page.locator("main").innerText();
    if (text.includes("ダウンロード対象") || text.includes("downloadable file") || text.includes("購入に含まれるデータ") || text.includes("Included downloads")) throw new Error("Redundant heading returned");
    if (text.includes("ガウシアンデータを見る")) throw new Error("Unverified hosting payment enabled a viewer link");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) throw new Error(`Overflow ${width}`);
    await page.screenshot({ path: `${out}/restored-${en ? "en" : "ja"}-${width}.png`, fullPage: true });
    results.push({ en, width, restored: await remove.count(), overflow });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results));
