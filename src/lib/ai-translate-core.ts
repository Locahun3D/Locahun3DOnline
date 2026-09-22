/**
 * 翻訳の本体（2026-09-23 分離）。Next の外（Worker の定期実行 custom-worker.ts）からも使うため、
 * "server-only" と getCloudflareContext を持たない。鍵は呼び出し側が渡す。サイトからは ai-translate.ts 経由で使う。
 */
/**
 * 物件テキストの日本語→英語 自動翻訳。
 *  - ANTHROPIC_API_KEY あり: Claude (claude-opus-4-8) が撮影ロケ紹介として
 *    自然な英語に翻訳し、JSON で返す。
 *  - キー無し: 翻訳せず空を返す（= 呼び出し側は EN 欄を空のまま保存し、
 *    localizeProperty が日本語へフォールバックする）。要約と違い機械的な
 *    ヒューリスティック翻訳は品質が出ないため no-op に倒す。
 * [[ai-summary]] と同じ「キー無し=フォールバック、キー投入=本番」パターン。
 *
 * prefecture / area / studioType / tags は schemas.ts の辞書
 * (PREFECTURE_EN / areaLabelEn / STUDIO_TYPE_EN / TAG_EN) で機械変換されるため
 * ここでは翻訳しない。自由記述の title / summary / description / city /
 * address / nearestStation / availableHours / permitType / permitNotes /
 * cover.alt と、各 splatItem の saleDescription（販売説明）・各 gallery
 * 画像の alt のみを対象にする。
 */

/** 翻訳対象（空文字は「翻訳不要」= 呼び出し側で既に埋まっている等）。 */
export interface TranslateInput {
  title: string;
  summary: string;
  description: string;
  city: string;
  /** 住所（番地まで）。 */
  address: string;
  /** 最寄り駅（路線・駅名・徒歩分など）。 */
  nearestStation: string;
  /** 利用可能時間の自由記述補足（例: 24時間可（要相談））。 */
  availableHours: string;
  /** 許可の種類（例: 道路使用許可）。 */
  permitType: string;
  /** 許可・注意事項（申請先・条件など）。 */
  permitNotes: string;
  /** カバー画像の代替テキスト。 */
  coverAlt: string;
  /** 各3DGSシーンの表示名（順序を保持）。 */
  sceneLabels: string[];
  /** 販売中データの説明文（順序を保持）。 */
  saleDescriptions: string[];
  /** ギャラリー画像の代替テキスト（順序を保持）。 */
  galleryAlts: string[];
  /** 設備の1行メモ（順序を保持。2026-09-21 追加）。 */
  amenityNotes: string[];
  /** 図面のラベル（順序を保持。2026-09-21 追加）。 */
  blueprintLabels: string[];
}

/** 翻訳結果。各フィールドは英語。翻訳できなかった要素は "" で返る。 */
export interface TranslateResult {
  titleEn: string;
  summaryEn: string;
  descriptionEn: string;
  cityEn: string;
  addressEn: string;
  nearestStationEn: string;
  availableHoursEn: string;
  permitTypeEn: string;
  permitNotesEn: string;
  coverAltEn: string;
  sceneLabelsEn: string[];
  saleDescriptionsEn: string[];
  galleryAltsEn: string[];
  amenityNotesEn: string[];
  blueprintLabelsEn: string[];
  source: "ai" | "none";
  /**
   * 訳せなかった理由（2026-09-23）。公開申請の画面に「キー未設定」「APIエラー」などを区別して出すため。
   * 成功時は undefined。
   */
  failure?: TranslateFailure;
}

export type TranslateFailure =
  | { kind: "no_key" }
  | { kind: "http"; status: number }
  | { kind: "truncated" }
  | { kind: "parse" }
  | { kind: "network" };

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}


function emptyResult(
  labelCount: number,
  saleCount: number,
  galleryCount: number,
  noteCount = 0,
  planCount = 0,
  failure?: TranslateFailure,
): TranslateResult {
  return {
    failure,
    titleEn: "",
    summaryEn: "",
    descriptionEn: "",
    cityEn: "",
    addressEn: "",
    nearestStationEn: "",
    availableHoursEn: "",
    permitTypeEn: "",
    permitNotesEn: "",
    coverAltEn: "",
    sceneLabelsEn: Array.from({ length: labelCount }, () => ""),
    saleDescriptionsEn: Array.from({ length: saleCount }, () => ""),
    galleryAltsEn: Array.from({ length: galleryCount }, () => ""),
    amenityNotesEn: Array.from({ length: noteCount }, () => ""),
    blueprintLabelsEn: Array.from({ length: planCount }, () => ""),
    source: "none",
  };
}

/**
 * 並びを「番号つきの辞書」にして、訳すものだけを送る（2026-09-23）。
 * 以前は空欄も含めた並びのまま送り「同じ長さ・同じ順で返せ」と頼んでいた。AI が空欄を飛ばして
 * 短い並びを返すと、以降の訳が1つずつずれて別の項目に入る／欠ける。STUDIO MONTFORT で設備メモ
 * （10項目中4項目だけ中身あり）が訳されず、公開申請が止まった。番号で対応させればずれない。
 */
function keyed(values: string[]): Record<string, string> {
  return Object.fromEntries(values.map((v, i) => [String(i), v] as const).filter(([, v]) => v.trim()));
}

/** 番号つきの辞書（または旧形式の並び）を、元の並びの長さに戻す。 */
export function unkeyed(value: unknown, count: number): string[] {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (Array.isArray(value)) return Array.from({ length: count }, (_, i) => str(value[i]));
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Array.from({ length: count }, (_, i) => str(obj[String(i)]));
}

function buildPrompt(input: TranslateInput): string {
  const payload = {
    title: input.title,
    summary: input.summary,
    description: input.description,
    city: input.city,
    address: input.address,
    nearestStation: input.nearestStation,
    availableHours: input.availableHours,
    permitType: input.permitType,
    permitNotes: input.permitNotes,
    coverAlt: input.coverAlt,
    sceneLabels: keyed(input.sceneLabels),
    saleDescriptions: keyed(input.saleDescriptions),
    galleryAlts: keyed(input.galleryAlts),
    amenityNotes: keyed(input.amenityNotes),
    blueprintLabels: keyed(input.blueprintLabels),
  };
  return [
    "You are a professional Japanese→English translator for a location-scouting / film-set rental platform (撮影ロケ地・スタジオ).",
    "Translate the Japanese property fields below into natural, professional English aimed at film/photo production users.",
    "",
    "Rules:",
    "- Translate meaning, not word-for-word. Keep it concise and natural for native English readers.",
    "- Keep proper nouns / brand names as-is; romanize place names (e.g. 渋谷区 → Shibuya-ku).",
    "- Preserve numbers, units and measurements exactly (m², kW, 人, etc. → sqm, kW, people).",
    "- Do NOT add facts that aren't in the source. Do NOT include marketing fluff not present in the original.",
    "- If a field is an empty string, return an empty string for it.",
    "- sceneLabels are short names of individual 3D-scanned scenes/rooms (e.g. 「1階メインホール」→「1F Main Hall」). Keep them short.",
    "- address is a street address; romanize it (e.g. 東京都江東区有明2-9-2 → 2-9-2 Ariake, Koto-ku, Tokyo).",
    "- nearestStation and availableHours are short free-text notes; keep them short and natural.",
    "- permitNotes is a practical notice about filming permits — preserve police-station names, phone numbers and other operational details exactly as in the source; only translate the surrounding prose.",
    "- coverAlt and galleryAlts are short image alt-text captions; keep them short and descriptive.",
    "- amenityNotes are one-line facility notes (e.g. 「3台まで」→「Up to 3 cars」, 「光回線 1Gbps」→「Fibre 1 Gbps」). Keep them very short.",
    "- blueprintLabels are floor-plan tab labels (e.g. 「1階平面図」→「1F floor plan」). Keep them very short.",
    "- sceneLabels, saleDescriptions, galleryAlts, amenityNotes and blueprintLabels are objects keyed by number; return objects with exactly the SAME keys, each value translated.",
    "",
    "Return ONLY a single JSON object, no prose, with exactly these keys:",
    '{"titleEn": string, "summaryEn": string, "descriptionEn": string, "cityEn": string, "addressEn": string, "nearestStationEn": string, "availableHoursEn": string, "permitTypeEn": string, "permitNotesEn": string, "coverAltEn": string, "sceneLabelsEn": {"<key>": string}, "saleDescriptionsEn": {"<key>": string}, "galleryAltsEn": {"<key>": string}, "amenityNotesEn": {"<key>": string}, "blueprintLabelsEn": {"<key>": string}}',
    "",
    "Source (JSON):",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseResult(
  resp: AnthropicResponse,
  labelCount: number,
  saleCount: number,
  galleryCount: number,
  noteCount = 0,
  planCount = 0,
): TranslateResult | null {
  const text = resp.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return {
      titleEn: str(obj.titleEn),
      summaryEn: str(obj.summaryEn),
      descriptionEn: str(obj.descriptionEn),
      cityEn: str(obj.cityEn),
      addressEn: str(obj.addressEn),
      nearestStationEn: str(obj.nearestStationEn),
      availableHoursEn: str(obj.availableHoursEn),
      permitTypeEn: str(obj.permitTypeEn),
      permitNotesEn: str(obj.permitNotesEn),
      coverAltEn: str(obj.coverAltEn),
      sceneLabelsEn: unkeyed(obj.sceneLabelsEn, labelCount),
      saleDescriptionsEn: unkeyed(obj.saleDescriptionsEn, saleCount),
      galleryAltsEn: unkeyed(obj.galleryAltsEn, galleryCount),
      amenityNotesEn: unkeyed(obj.amenityNotesEn, noteCount),
      blueprintLabelsEn: unkeyed(obj.blueprintLabelsEn, planCount),
      source: "ai",
    };
  } catch {
    return null;
  }
}

/**
 * 日本語フィールドを英語へ翻訳する。キー未設定・失敗時は空結果（no-op）を返し、
 * 呼び出し側は EN 欄を空のまま保存する（= 日本語表示にフォールバック）。
 */
export async function translatePropertyWithKey(input: TranslateInput, apiKey: string | null): Promise<TranslateResult> {
  const labelCount = input.sceneLabels.length;
  const saleCount = input.saleDescriptions.length;
  const galleryCount = input.galleryAlts.length;
  const noteCount = input.amenityNotes.length;
  const planCount = input.blueprintLabels.length;

  // 翻訳すべき自由記述が何も無いなら API を叩かない。
  const hasAnything =
    !!input.title.trim() ||
    !!input.summary.trim() ||
    !!input.description.trim() ||
    !!input.city.trim() ||
    !!input.address.trim() ||
    !!input.nearestStation.trim() ||
    !!input.availableHours.trim() ||
    !!input.permitType.trim() ||
    !!input.permitNotes.trim() ||
    !!input.coverAlt.trim() ||
    input.sceneLabels.some((s) => s.trim()) ||
    input.saleDescriptions.some((s) => s.trim()) ||
    input.galleryAlts.some((s) => s.trim()) ||
    input.amenityNotes.some((s) => s.trim()) ||
    input.blueprintLabels.some((s) => s.trim());
  if (!hasAnything) return emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount);

  if (!apiKey) return emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount, { kind: "no_key" });

  const prompt = buildPrompt(input);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        // 説明文が長い物件で 4096 だと途中で切れて JSON が壊れる（切れたら truncated として報告する）。
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount, { kind: "http", status: res.status });
    const data = (await res.json()) as AnthropicResponse;
    if (data.stop_reason === "max_tokens") {
      return emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount, { kind: "truncated" });
    }
    return (
      parseResult(data, labelCount, saleCount, galleryCount, noteCount, planCount) ??
      emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount, { kind: "parse" })
    );
  } catch {
    return emptyResult(labelCount, saleCount, galleryCount, noteCount, planCount, { kind: "network" });
  }
}
