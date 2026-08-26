import { permanentRedirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";

/**
 * /terms — index ページは存在せず、実体は /terms/{service,tokushoho,...} の各規約。
 * 素の /terms を直打ちすると 404（NO SIGNAL）になっていた（2026-08-16 の
 * 全ページ検証で発見）。サイト内に /terms への直リンクは無いが、URL を
 * 手で削る人のために利用規約本体へ転送する。
 */
export default async function TermsIndex() {
  const locale = await getLocale();
  permanentRedirect(locale === "en" ? "/en/terms/service" : "/terms/service");
}
