import type { Property } from "./schemas";

/**
 * 「日本語はあるのに英語(EN欄)が空」の項目を列挙する純関数（2026-09-20）。
 *
 * server / client 両方から使う（`server-only` を入れないこと）:
 *  - サーバー: 公開申請の翻訳必須ガード、バルク翻訳の要否判定（property-translate.ts）
 *  - クライアント: エディターの公開フロー表示（英訳が済んでいるか）
 * 判定を1か所にしておかないと、画面の「英訳済み」とサーバーのガードがズレる。
 */
type EnglishSource = Pick<
  Property,
  | "title" | "titleEn" | "summary" | "summaryEn" | "description" | "descriptionEn"
  | "city" | "cityEn" | "address" | "addressEn" | "nearestStation" | "nearestStationEn"
  | "availableHours" | "availableHoursEn" | "permitType" | "permitTypeEn"
  | "permitNotes" | "permitNotesEn" | "cover" | "gallery" | "splatItems"
  | "amenityNotes" | "amenityNotesEn" | "blueprints"
>;

const has = (s: string | undefined | null) => !!(s ?? "").trim();

/** 未翻訳の項目名（日本語ラベル）。空配列 = 英訳が揃っている。 */
export function missingEnglishFields(p: EnglishSource): string[] {
  const out: string[] = [];
  const check = (label: string, ja: string | undefined, en: string | undefined) => {
    if (has(ja) && !has(en)) out.push(label);
  };
  check("物件名", p.title, p.titleEn);
  check("サマリー", p.summary, p.summaryEn);
  check("概要", p.description, p.descriptionEn);
  check("市区町村", p.city, p.cityEn);
  check("住所", p.address, p.addressEn);
  check("最寄り駅", p.nearestStation, p.nearestStationEn);
  check("利用可能時間", p.availableHours, p.availableHoursEn);
  check("許可の種類", p.permitType, p.permitTypeEn);
  check("許可の補足", p.permitNotes, p.permitNotesEn);
  check("カバー画像の代替テキスト", p.cover?.alt, p.cover?.altEn);
  const galleryMissing = (p.gallery ?? []).filter((g) => has(g.alt) && !has(g.altEn)).length;
  if (galleryMissing > 0) out.push(`ギャラリーの代替テキスト（${galleryMissing}枚）`);
  const items = p.splatItems ?? [];
  const labelMissing = items.filter((it) => has(it.label) && !has(it.labelEn)).length;
  if (labelMissing > 0) out.push(`3DGSシーン名（${labelMissing}件）`);
  const saleMissing = items.filter(
    (it) => has(it.saleDescription) && !has(it.saleDescriptionEn),
  ).length;
  if (saleMissing > 0) out.push(`販売説明（${saleMissing}件）`);
  // 2026-09-21 追加: 設備の1行メモと図面ラベルも EN ページに出るので翻訳の対象にする。
  const notes = p.amenityNotes ?? {};
  const notesEn = (p.amenityNotesEn ?? {}) as Record<string, string>;
  const noteMissing = Object.entries(notes).filter(
    ([k, v]) => has(v as string) && !has(notesEn[k]),
  ).length;
  if (noteMissing > 0) out.push(`設備のメモ（${noteMissing}件）`);
  const planMissing = (p.blueprints ?? []).filter((b) => has(b.label) && !has(b.labelEn)).length;
  if (planMissing > 0) out.push(`図面のラベル（${planMissing}件）`);
  return out;
}

export function needsEnglish(p: EnglishSource): boolean {
  return missingEnglishFields(p).length > 0;
}
