import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * AIタグ自動生成。
 *  - ANTHROPIC_API_KEY あり: Claude (claude-opus-4-8) + web_search サーバーツールで
 *    物件名・所在地・公式サイトをネット検索し、撮影ロケ向けの日本語タグを提案。
 *  - キー無し: 入力フィールドからヒューリスティックにタグを導出（フォールバック）。
 * Stripe と同じく「キー無し=フォールバック、キー投入=本番」パターン。
 */

export interface TagSuggestInput {
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
  existingTags: string[];
}

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

const CATEGORY_TAG: Record<string, string[]> = {
  studio: ["スタジオ", "ホリゾント"],
  warehouse: ["倉庫", "インダストリアル"],
  house: ["住宅", "生活感"],
  outdoor: ["屋外", "ロケーション"],
  office: ["オフィス", "会議室"],
  other: [],
};

/** ネット検索なしで、入力フィールドから妥当なタグを導出するフォールバック。 */
function heuristicTags(input: TagSuggestInput): string[] {
  const out = new Set<string>();
  for (const t of CATEGORY_TAG[input.category] ?? []) out.add(t);
  if (input.studioType) out.add(input.studioType);
  if (input.prefecture) out.add(input.prefecture);
  if (input.ceilingHeightM >= 5) out.add("高天井");
  if (input.floorAreaSqm >= 300) out.add("大空間");
  else if (input.floorAreaSqm > 0 && input.floorAreaSqm < 80) out.add("小規模");
  if (input.hasNaturalLight) out.add("自然光");
  if (input.parking) out.add("駐車場");
  if (input.loadingDock) out.add("大型搬入可");
  if (/200\s*V/i.test(input.powerVoltage)) out.add("200V電源");
  if (input.capacity >= 50) out.add("大人数収容");
  // 既存タグと重複を除外
  const existing = new Set(input.existingTags.map((t) => t.trim()));
  return [...out].filter((t) => t && !existing.has(t)).slice(0, 12);
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

function buildPrompt(input: TagSuggestInput): string {
  const loc = [input.prefecture, input.city, input.area].filter(Boolean).join(" ");
  const specs = [
    input.floorAreaSqm ? `床面積${input.floorAreaSqm}㎡` : "",
    input.ceilingHeightM ? `天井高${input.ceilingHeightM}m` : "",
    input.capacity ? `収容${input.capacity}名` : "",
    input.hasNaturalLight ? "自然光あり" : "",
  ].filter(Boolean).join(" / ");
  return [
    "あなたは日本の撮影ロケ地プラットフォームのメタデータ担当です。",
    "次の手順でこの物件のタグを割り出してください:",
    "① 公式サイトURLが与えられていれば web_fetch でそのページを取得し、",
    "   設備・コンセプト・撮影実績・雰囲気を読み取る。",
    "② 物件名＋所在地で web_search（Google検索相当）し、紹介記事や口コミも参照する。",
    "③ ①②の内容から、撮影・ロケハンで検索されやすい日本語タグ（短い名詞・名詞句）を提案。",
    "観点: 建物種別 / 質感・雰囲気 / 設備 / ロケーション特性 / 撮影ジャンル適性。",
    "6〜12個。既存タグと重複しないもの。固有名詞や住所は含めない。",
    "",
    `■ 物件名: ${input.title || "（不明）"}`,
    `■ カテゴリ: ${input.category}${input.studioType ? ` / ${input.studioType}` : ""}`,
    `■ 所在地: ${loc || "（不明）"}`,
    input.contactWebsite ? `■ 公式サイト: ${input.contactWebsite}` : "",
    specs ? `■ スペック: ${specs}` : "",
    input.description ? `■ 説明: ${input.description.slice(0, 300)}` : "",
    `■ 既存タグ: ${input.existingTags.join("、") || "（なし）"}`,
    "",
    'タグだけを JSON で返してください。説明文は不要です。形式: {"tags": ["タグ1", "タグ2"]}',
  ].filter(Boolean).join("\n");
}

function parseTags(resp: AnthropicResponse): string[] {
  const text = resp.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
  const match = text.match(/\{[\s\S]*"tags"[\s\S]*?\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]) as { tags?: unknown };
    if (Array.isArray(obj.tags)) {
      return obj.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  } catch {
    /* fall through */
  }
  return [];
}

/** Claude + web_search でネット検索しタグ提案。失敗時は heuristic にフォールバック。 */
export async function suggestTags(
  input: TagSuggestInput,
): Promise<{ tags: string[]; source: "ai" | "heuristic" }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { tags: heuristicTags(input), source: "heuristic" };
  }

  // 公式サイトを取得する web_fetch ＋ Google検索相当の web_search。
  // web_fetch 未対応アカウントでも動くよう、ツール無しでも再試行する。
  const TOOL_SETS = [
    [
      { type: "web_fetch_20250910", name: "web_fetch", max_uses: 3 },
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
    ],
    [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
  ];

  const prompt = buildPrompt(input);
  const existing = new Set(input.existingTags.map((t) => t.trim()));

  for (const tools of TOOL_SETS) {
    try {
      const body = {
        model: "claude-opus-4-8",
        max_tokens: 1024,
        tools,
        messages: [{ role: "user", content: prompt }],
      };

      let data: AnthropicResponse | null = null;
      let messages = body.messages as Array<{ role: string; content: unknown }>;
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
          body: JSON.stringify({ ...body, messages }),
        });
        if (res.status === 400) {
          // ツール未対応など → 次のツールセットで再試行。
          badRequest = true;
          break;
        }
        if (!res.ok) throw new Error(`anthropic ${res.status}`);
        data = (await res.json()) as AnthropicResponse;
        if (data.stop_reason !== "pause_turn") break;
        messages = [...messages, { role: "assistant", content: data.content }];
      }
      if (badRequest) continue;

      const tags = data
        ? parseTags(data).filter((t) => !existing.has(t)).slice(0, 12)
        : [];
      if (tags.length) return { tags, source: "ai" };
    } catch {
      /* 次のツールセット、または heuristic へ */
    }
  }
  return { tags: heuristicTags(input), source: "heuristic" };
}
