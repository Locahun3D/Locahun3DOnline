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
  school: "学校",
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

/**
 * ネットなしで、入力フィールドから妥当なサマリーを組み立てるフォールバック。
 * カテゴリに準拠した内容にする（屋外で床面積/天井高を出さない等）。
 * タグは物件タイプと不整合な古い値が残っていることがあるため使わず、
 * カテゴリに応じた中立的な用途文で締める（例: 倉庫タグが屋外物件に残る等の誤りを防ぐ）。
 */
function heuristicSummary(input: SummarySuggestInput): string {
  const loc = [input.prefecture, input.city].filter(Boolean).join("");
  const typeName =
    input.studioType || CATEGORY_JP[input.category] || "スペース";
  const isOutdoor = input.category === "outdoor";

  const specs: string[] = [];
  if (!isOutdoor && input.floorAreaSqm > 0)
    specs.push(`床面積${input.floorAreaSqm}㎡`);
  if (!isOutdoor && input.ceilingHeightM > 0)
    specs.push(`天井高${input.ceilingHeightM}m`);
  if (input.capacity > 0) specs.push(`収容${input.capacity}名`);
  if (input.hasNaturalLight) specs.push("自然光");
  if (input.parking) specs.push("駐車場あり");

  const head = `${loc ? loc + "の" : ""}${typeName}。`;
  const specLine = specs.length ? specs.join("・") + "。" : "";
  const close = isOutdoor
    ? "屋外ロケ撮影に対応。"
    : "CM・MV・スチール等の撮影に対応。";

  let s = `${head}${specLine}${close}`;
  if (s.length < 10 && input.title) s = `${input.title}。${s}`;
  return s.slice(0, 100);
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
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
    "次の手順で、この物件の一覧カード用の短い紹介文を作成してください:",
    "① 公式サイトURLがあれば web_fetch でそのページを取得し、その物件の実際の",
    "   設備・コンセプト・雰囲気・特色を読み取る。",
    "② 必要なら 物件名＋所在地 で web_search し、確実にこの物件についての情報だけを補う",
    "   （別物件・別店舗の情報は使わない。同名の別施設に注意）。",
    "③ ①②で確認できた事実と、下の入力情報だけを根拠に、日本語1〜2文・40〜80字で書く。",
    "",
    "制約（重要）:",
    "・事実ベースのみ。裏付けの取れない実績・受賞・「多数」等の断定は書かない（誇張・虚偽は禁止）。",
    "・確証が持てない情報は書かず、入力スペックの範囲で簡潔にまとめる。",
    "・3DGS/オンラインロケハンの一般説明（フォトリアル/ブラウザで歩ける/下見削減 等）は",
    "  全物件共通で自明なので書かない。その物件ならではの質感・特色だけを書く。",
    "・絵文字・誇張表現・固有の住所/電話番号は禁止。",
    "",
    `■ 物件名: ${input.title || "（不明）"}`,
    `■ 種別: ${CATEGORY_JP[input.category] || input.category}${input.studioType ? ` / ${input.studioType}` : ""}`,
    `■ 所在地: ${loc || "（不明）"}`,
    input.contactWebsite ? `■ 公式サイト: ${input.contactWebsite}` : "",
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

/**
 * Claude でサマリー生成。公式サイトを web_fetch ／必要なら web_search で参照し、
 * 事実ベースで要約する（[[ai-tags]] と同じツールループ）。失敗時は heuristic。
 * web_fetch/web_search 未対応アカウントでもツール無しで再試行→最後は heuristic。
 */
export async function suggestSummary(
  input: SummarySuggestInput,
): Promise<{ summary: string; source: "ai" | "heuristic" }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { summary: heuristicSummary(input), source: "heuristic" };
  }

  // 公式HP取得(web_fetch)＋検索(web_search) → ツール無し の順でフォールバック。
  const TOOL_SETS = [
    [
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 },
      { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    ],
    [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    [],
  ];

  const prompt = buildPrompt(input);

  for (const tools of TOOL_SETS) {
    try {
      const base: Record<string, unknown> = {
        model: "claude-opus-4-8",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      };
      if (tools.length) base.tools = tools;

      let data: AnthropicResponse | null = null;
      let messages = base.messages as Array<{ role: string; content: unknown }>;
      let badRequest = false;
      // server-side tool loop: pause_turn のとき assistant content を足して継続。
      for (let i = 0; i < 4; i++) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ ...base, messages }),
        });
        if (res.status === 400) {
          badRequest = true; // ツール未対応など → 次のツールセットへ
          break;
        }
        if (!res.ok) throw new Error(`anthropic ${res.status}`);
        data = (await res.json()) as AnthropicResponse;
        if (data.stop_reason !== "pause_turn") break;
        messages = [...messages, { role: "assistant", content: data.content }];
      }
      if (badRequest) continue;

      const summary = data ? parseSummary(data) : "";
      if (summary && summary.length >= 8) {
        return { summary: summary.slice(0, 120), source: "ai" };
      }
    } catch {
      /* 次のツールセット、または heuristic へ */
    }
  }
  return { summary: heuristicSummary(input), source: "heuristic" };
}
