import { permanentRedirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

/**
 * /demo — 2026-08-16 に /pricing へ統合（本人指示「料金とデモまとめて」）。
 *
 * - 中身（ビューアーデモ導線・料金シミュレーター・お問い合わせ導線）は
 *   `src/app/pricing/page.tsx` へ移した。シミュレーター本体は
 *   `src/components/demo/estimate-simulator.tsx` のまま（import 先が変わっただけ）。
 * - 旧マーケサイト `web.locahun3d.com/locahun3d_demo.html` の 301 先もこのURL
 *   （最終的に /pricing へ着地）。設計_サイト統合_スキャン分岐廃止_2026-08-16.md 参照。
 * - EN は middleware が /en/demo → /demo に rewrite して x-locale=en を渡すので、
 *   locale を見て /en/pricing へ返す。
 */
export default async function DemoPage() {
  const locale = await getLocale();
  permanentRedirect(localizedHref("/pricing", locale));
}
