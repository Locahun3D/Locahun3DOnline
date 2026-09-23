// 物件への英訳の当てはめ（2026-09-23 分離）。Next の外（Worker の定期実行）からも使うため "server-only" を持たない。
import { propertySchema, type Property } from "./schemas";
import type { TranslateFailure, TranslateInput, TranslateResult } from "./ai-translate-core";
import { needsEnglish } from "./property-english";


/**
 * 訳した文字列が欄の上限を超えたら、その欄だけ上限まで切る（2026-09-23）。
 *
 * ⚠ これが無いと、1欄が長すぎるだけで **レコード全体がスキーマ検証に落ち**、
 *   管理画面の物件一覧と公開側のカタログから丸ごと消える（store.ts の coerceProperty は
 *   list() では null を返す）。実際に起きた: ビュースタジオ水道橋の
 *   amenityNotesEn.loadingDock が 91 字（上限80）になり、一覧から消えていた
 *   （本人 2026-09-23「ビュースタジオがないが」）。英語は日本語より長くなりやすい。
 *   切るのは英語の自動翻訳だけ。日本語（人が書いた欄）は触らない。
 */
export function clampToSchema(p: Property): { property: Property; trimmed: string[] } {
  const parsed = propertySchema.safeParse(p);
  if (parsed.success) return { property: p, trimmed: [] };
  const next = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  const trimmed: string[] = [];
  for (const issue of parsed.error.issues) {
    if (issue.code !== "too_big" || typeof issue.maximum !== "number") continue;
    const path = issue.path as (string | number)[];
    let node: Record<string | number, unknown> | undefined = next as never;
    for (const key of path.slice(0, -1)) {
      node = node?.[key] as Record<string | number, unknown> | undefined;
    }
    const last = path[path.length - 1];
    const value = node?.[last];
    if (!node || typeof value !== "string" || value.length <= issue.maximum) continue;
    node[last] = cutAtWord(value, issue.maximum);
    trimmed.push(path.join("."));
  }
  const again = propertySchema.safeParse(next);
  // 直せない種類の崩れ（型違いなど）はここでは触らない。呼び出し側が元を返す。
  return again.success ? { property: again.data, trimmed } : { property: p, trimmed: [] };
}

/** 上限内で、できれば単語の切れ目まで下げて切る。 */
function cutAtWord(s: string, max: number): string {
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("、"), cut.lastIndexOf("; "));
  const body = at >= Math.floor(max * 0.6) ? cut.slice(0, at) : cut;
  return body.replace(/[\s,;:(（、]+$/, "");
}

/**
 * 「日本語はあるが英語(EN欄)が空」の判定。正本は lib/property-english.ts（純関数・
 * client からも使う）へ移した（2026-09-20）。既存の import 元を壊さないよう再エクスポートする。
 */
export { needsEnglish };

/**
 * 空の EN 欄だけを自動翻訳で埋めた新しい Property を返す。
 * - 既に手動で埋めた EN 欄は温存する（`existing || translated`）。
 * - ANTHROPIC_API_KEY 未設定・API 失敗時は翻訳結果が空になり、元のまま返る
 *   （＝日本語表示にフォールバック）。副作用なし・例外を投げない。
 */
/** 訳した結果と、訳せなかった理由（公開申請の画面に出す。2026-09-23）。 */
export async function fillPropertyEnglishUsing(
  p: Property,
  translate: (input: TranslateInput) => Promise<TranslateResult>,
): Promise<{ property: Property; failure?: TranslateFailure }> {
  if (!needsEnglish(p)) return { property: p };

  // 空の EN 欄に対応する日本語だけを翻訳対象に渡す（既訳は "" にして温存）。
  const sceneLabels = p.splatItems.map((it) => (it.labelEn.trim() ? "" : it.label));
  const saleDescriptions = p.splatItems.map((it) =>
    it.saleDescriptionEn.trim() ? "" : it.saleDescription,
  );
  const galleryAlts = p.gallery.map((g) => (g.altEn.trim() ? "" : g.alt));
  // 設備メモと図面ラベルも同じやり方で（既訳は "" にして温存。2026-09-21）。
  const noteKeys = Object.keys(p.amenityNotes) as (keyof typeof p.amenityNotes)[];
  const amenityNotes = noteKeys.map((k) =>
    (p.amenityNotesEn?.[k] ?? "").trim() ? "" : p.amenityNotes[k],
  );
  const blueprintLabels = p.blueprints.map((b) => (b.labelEn.trim() ? "" : b.label));

  const r = await translate({
    title: p.titleEn.trim() ? "" : p.title,
    summary: p.summaryEn.trim() ? "" : p.summary,
    description: p.descriptionEn.trim() ? "" : p.description,
    city: p.cityEn.trim() ? "" : p.city,
    address: p.addressEn.trim() ? "" : p.address,
    nearestStation: p.nearestStationEn.trim() ? "" : p.nearestStation,
    availableHours: p.availableHoursEn.trim() ? "" : p.availableHours,
    permitType: p.permitTypeEn.trim() ? "" : p.permitType,
    permitNotes: p.permitNotesEn.trim() ? "" : p.permitNotes,
    coverAlt: p.cover.altEn.trim() ? "" : p.cover.alt,
    sceneLabels,
    saleDescriptions,
    galleryAlts,
    amenityNotes,
    blueprintLabels,
  });

  if (r.source === "none") return { property: p, failure: r.failure };

  const property: Property = {
    ...p,
    titleEn: p.titleEn || r.titleEn,
    summaryEn: p.summaryEn || r.summaryEn,
    descriptionEn: p.descriptionEn || r.descriptionEn,
    cityEn: p.cityEn || r.cityEn,
    addressEn: p.addressEn || r.addressEn,
    nearestStationEn: p.nearestStationEn || r.nearestStationEn,
    availableHoursEn: p.availableHoursEn || r.availableHoursEn,
    permitTypeEn: p.permitTypeEn || r.permitTypeEn,
    permitNotesEn: p.permitNotesEn || r.permitNotesEn,
    cover: { ...p.cover, altEn: p.cover.altEn || r.coverAltEn },
    gallery: p.gallery.map((g, i) => ({
      ...g,
      altEn: g.altEn || (r.galleryAltsEn[i] ?? ""),
    })),
    splatItems: p.splatItems.map((it, i) => ({
      ...it,
      labelEn: it.labelEn || (r.sceneLabelsEn[i] ?? ""),
      saleDescriptionEn: it.saleDescriptionEn || (r.saleDescriptionsEn[i] ?? ""),
    })),
    amenityNotesEn: Object.fromEntries(
      noteKeys.map((k, i) => [k, (p.amenityNotesEn?.[k] ?? "") || (r.amenityNotesEn[i] ?? "")]),
    ) as Property["amenityNotesEn"],
    blueprints: p.blueprints.map((b, i) => ({
      ...b,
      labelEn: b.labelEn || (r.blueprintLabelsEn[i] ?? ""),
    })),
  };
  return { property: clampToSchema(property).property, failure: r.failure };
}
