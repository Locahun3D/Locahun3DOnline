import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * サマリー（一覧カードに出る短文）の自動生成。
 *  - ANTHROPIC_API_KEY あり: Claude (claude-opus-4-8) が物件情報から
 *    撮影ロケ向けの短い紹介文（40〜80字程度）を1〜2文で生成。
 *  - キー無し: 入力フィールドからテンプレ生成（フォールバック）。
 * [[ai-tags]] と同じ「キー無し=フォールバック、キー投入=本番」パターン。
 */

export interface SummarySuggestInput {
  title: string;
  category: string;
  studioType: string;
  prefecture: string;
  city: string;
  area: string;
  contactWebsite: string;
  description: string;
  capacity: number;
  floorAreaSqm: number;
  ceilingHeightM: number;
  hasNaturalLight: boolean;
  parking: boolean;
  loadingDock: boolean;
  powerVoltage: string;
  tags: string[];
}

const CATEGORY_JP: Record<string, string> = {
  studio: "スタジオ",
  warehouse: "倉庫",
  house: "住宅",
  shop: "店舗",
  outdoor: "屋外ロケ地",
  venue: "会場",
  other: "スペース",
};

async function getApiKey(): Promise<string | null> {
  try {
    const { env } = await getCloudflareContext();
    const k = (env as Record<string, unknown>).ANTHROPIC_API_KEY;
    if (typeof k === "string" && k) return k;
  } catch {
    /* not on Workers */
  }
  return process.env.ANTHROPIC_API_KEY || null;
}

/** ネットなしで、入力フィールドから妥当なサマリーを組み立てるフォールバック。 */
function heuristicSummary(input: SummarySuggestInput): string {
  const loc = [input.prefecture, input.city].filter(Boolean).join("");
  const typeName =
    input.studioType || CATEGORY_JP[input.category] || "スペース";
  const specs: string[] = [];
  if (input.floorAreaSqm > 0) specs.push(`床面積${input.floorAreaSqm}㎡`);
  if (input.category !== "outdoor" && input.ceilingHeightM > 0)
    specs.push(`天井高${input.ceilingHeightM}m`);
  if (input.capacity > 0) specs.push(`収容${input.capacity}名`);
  if (input.hasNaturalLight) specs.push("自然光あり");

  const useTags = input.tags.filter(Boolean).slice(0, 3);
  const sentences: string[] = [];
  sentences.push(`${loc ? loc + "の" : ""}${typeName}。`);
  if (specs.length) sentences.push(specs.join("・") + "。");
  if (useTags.length) sentences.push(`${useTags.join("・")}の撮影に。`);
  let s = sentences.join("");
  if (s.length < 10 && input.title) s = `${input.title}。${s}`;
  return s.slice(0, 90);
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
}

function buildPrompt(input: SummarySuggestInput): string {
  const loc = [input.prefecture, input.city, input.area]
    .filter(Boolean)
    .join(" ");
  const specs = [
    input.floorAreaSqm ? `床面積${input.floorAreaSqm}㎡` : "",
    input.category !== "outdoor" && input.ceilingHeightM
      ? `天井高${input.ceilingHeightM}m`
      : "",
    input.capacity ? `収容${input.capacity}名` : "",
    input.hasNaturalLight ? "自然光あり" : "",
    input.parking ? "駐車可" : "",
    input.loadingDock ? "大型搬入可" : "",
    input.powerVoltage ? `電源${input.powerVoltage}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  return [
    "あなたは日本の撮影ロケ地プラットフォームの編集者です。",
    "以下の物件について、一覧カードに表示する短い紹介文を日本語で1〜2文・40〜80字で書いてください。",
    "質感・雰囲気・撮影適性が伝わるように。誇張や絵文字は禁止。固有の住所や電話番号は含めない。",
    "",
    `■ 物件名: ${input.title || "（不明）"}`,
    `■ 種別: ${CATEGORY_JP[input.category] || input.category}${input.studioType ? ` / ${input.studioType}` : ""}`,
    `■ 所在地: ${loc || "（不明）"}`,
    specs ? `■ スペック: ${specs}` : "",
    input.tags.length ? `■ タグ: ${input.tags.join("、")}` : "",
    input.description ? `■ 詳細説明: ${input.description.slice(0, 400)}` : "",
    "",
    "紹介文だけを JSON で返してください。形式: {\"summary\": \"...\"}",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseSummary(resp: AnthropicResponse): string {
  const text = resp.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
  const match = text.match(/\{[\s\S]*"summary"[\s\S]*?\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { summary?: unknown };
      if (typeof obj.summary === "string") return obj.summary.trim();
    } catch {
      /* fall through */
    }
  }
  return "";
}

/** Claude でサマリー生成。失敗時は heuristic フォールバック。 */
export async function suggestSummary(
  input: SummarySuggestInput,
): Promise<{ summary: string; source: "ai" | "heuristic" }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { summary: heuristicSummary(input), source: "heuristic" };
  }

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
        max_tokens: 512,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as AnthropicResponse;
    const summary = parseSummary(data);
    if (summary && summary.length >= 8) {
      return { summary: summary.slice(0, 120), source: "ai" };
    }
  } catch {
    /* fall through to heuristic */
  }
  return { summary: heuristicSummary(input), source: "heuristic" };
}
