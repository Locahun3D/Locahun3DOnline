import "server-only";
import type { Property } from "./schemas";
import { translateProperty, type TranslateFailure } from "./ai-translate";
import { fillPropertyEnglishUsing } from "./property-translate-core";
export { needsEnglish } from "./property-english";

/**
 * 空の英語欄を自動で埋める（サイト用）。本体は property-translate-core.ts。
 * ANTHROPIC_API_KEY 未設定・API 失敗時は元のまま返る（例外を投げない）。
 */
export async function fillPropertyEnglish(p: Property): Promise<Property> {
  return (await fillPropertyEnglishWithReport(p)).property;
}

/** 訳した結果と、訳せなかった理由（公開申請の画面に出す）。 */
export async function fillPropertyEnglishWithReport(
  p: Property,
): Promise<{ property: Property; failure?: TranslateFailure }> {
  return fillPropertyEnglishUsing(p, translateProperty);
}
