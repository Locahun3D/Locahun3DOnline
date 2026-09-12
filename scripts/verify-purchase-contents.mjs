import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const out = `${root}artifacts/purchase-contents-20260912`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false });
const results = [];
try {
  const page = await browser.newPage();
  const data = JSON.parse(await readFile(`${root}data/properties.json`, "utf8"));
  const property = data.properties.find(p => p.id === "wh-002");
  const cart = property.splatItems.map((item, index) => ({ propertyId: property.id, splatItemIndex: index, title: property.title, label: item.label, price: item.salePrice, license: item.license }));
  await page.addInitScript((cart) => localStorage.setItem("locahun3d:cart:v1", JSON.stringify(cart)), cart);
  for (const locale of ["ja", "en"]) {
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`http://localhost:3032/${locale === "en" ? "en/" : ""}properties/wh-002`, { waitUntil: "networkidle" });
      const contents = page.getByRole("region", { name: locale === "en" ? "Included downloads" : "購入に含まれるデータ" }).first();
      await contents.waitFor({ timeout: 15000 });
      await contents.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${locale}-${width}.png` });
      const text = await contents.innerText();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      results.push({ locale, width, text, overflow });
      if (overflow) throw new Error(`Page overflow at ${locale}/${width}`);
      await page.goto(`http://localhost:3032/${locale === "en" ? "en/" : ""}cart`, { waitUntil: "networkidle" });
      const cartContents = page.getByRole("region", { name: locale === "en" ? "Included downloads" : "購入に含まれるデータ" }).first();
      await cartContents.waitFor({ timeout: 15000 });
      await page.screenshot({ path: `${out}/cart-${locale}-${width}.png`, fullPage: true });
      const cartText = await page.locator("main").innerText();
      const cartOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (cartOverflow || !cartText.includes(locale === "en" ? "Selected license" : "選択ライセンス")) throw new Error(`Cart failed at ${locale}/${width}`);
      results.push({ page: "cart", locale, width, text: await cartContents.innerText(), overflow: cartOverflow });
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
