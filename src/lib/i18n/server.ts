import "server-only";
import { headers } from "next/headers";
import { isLocale, translate, type DictKey, type Locale } from "./dictionaries";

/** middleware(proxy) が付与した `x-locale` を読む。既定は ja。 */
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const v = h.get("x-locale");
  return isLocale(v) ? v : "ja";
}

/** サーバ用 t。`const t = await getT(); t("nav.pricing")` */
export async function getT(): Promise<(key: DictKey) => string> {
  const locale = await getLocale();
  return (key: DictKey) => translate(locale, key);
}
