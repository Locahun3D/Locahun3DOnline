/**
 * 3Dデータを受け取るときに聞く「用途」（2026-10-13 本人指示）。
 *
 * なぜ要るか: 無料配布で2日に530人が登録したが、9割がフリーメールで会社名は0件。
 * 誰が制作会社で誰が個人のVRChat・ゲーム利用なのかが分からず、営業にも次の商品づくりにも
 * 使えなかった。ダウンロードの直前に1問だけ聞いて購入レコードに残す。
 *
 * ここは純関数（server / client 両方から import する。`server-only` 禁止）。
 */
export const USE_PURPOSES = [
  { key: "video", ja: "映像制作（映画・ドラマ・CM・MV・VFX）", en: "Film / video / VFX production" },
  { key: "game", ja: "ゲーム制作", en: "Game development" },
  { key: "vrchat", ja: "VRChat・メタバース", en: "VRChat / metaverse" },
  { key: "architecture", ja: "建築・空間デザイン・イベント", en: "Architecture / spatial design / events" },
  { key: "study", ja: "学習・研究・技術検証", en: "Study / research / tech evaluation" },
  { key: "personal", ja: "個人の趣味", en: "Personal hobby" },
  { key: "other", ja: "その他", en: "Other" },
] as const;

export type UsePurpose = (typeof USE_PURPOSES)[number]["key"];

export function isUsePurpose(value: unknown): value is UsePurpose {
  return typeof value === "string" && USE_PURPOSES.some((p) => p.key === value);
}

export function purposeLabel(value: string | undefined, locale: "ja" | "en" = "ja"): string {
  const hit = USE_PURPOSES.find((p) => p.key === value);
  return hit ? hit[locale] : "";
}

/** 会社名・所属の入力を保存用に整える（前後の空白を取り、長すぎる分は切る）。 */
export function cleanBuyerCompany(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export interface PurchaseIntake {
  usePurpose: UsePurpose;
  buyerCompany: string;
  /** 案内メールを受け取るにチェックしたか（オプトイン。未チェックは既存の同意を変えない）。 */
  marketingConsent: boolean;
}

/** 購入APIのリクエストから用途などを読む。用途が無い・不正なら null（APIは400を返す）。 */
export function parsePurchaseIntake(body: {
  usePurpose?: unknown;
  buyerCompany?: unknown;
  marketingConsent?: unknown;
}): PurchaseIntake | null {
  if (!isUsePurpose(body.usePurpose)) return null;
  return {
    usePurpose: body.usePurpose,
    buyerCompany: cleanBuyerCompany(body.buyerCompany),
    marketingConsent: body.marketingConsent === true,
  };
}
