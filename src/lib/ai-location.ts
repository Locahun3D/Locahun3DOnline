import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { geocodeAddress } from "@/lib/geocode";
import { AREA_SUGGESTIONS } from "@/lib/schemas";

/**
 * スタジオ名称から、地名（都道府県/市区町村/エリア）と座標を自動検索する。
 *  - ANTHROPIC_API_KEY あり: Claude が web_search でその施設の実在の所在地
 *    （住所）を確認 → 住所を @/lib/geocode の GSI/Nominatim に渡して座標を
 *    確定させる（座標の数値精度自体は AI に出させず、ジオコーディングAPIに
 *    委ねるハイブリッド構成 — LLM は数値の丸め/桁を誤りやすいため）。
 *  - キー無し、または住所が特定できない場合はエラーを返す（ヒューリスティック
 *    フォールバックは意味がないため無し。入力欄への手動貼り付けに任せる）。
 * [[ai-summary]] と同じ「キー無し=利用不可、キー投入=本番」パターン。
 */

export interface LocationSuggestInput {
  title: string;
  category: string;
  studioType: string;
  /** 既に入力済みなら手がかりとして渡す（同名の別施設との混同を避ける）。 */
  prefecture: string;
  city: string;
  area: string;
}

export interface LocationSuggestResult {
  prefecture: string;
  city: string;
  area: string;
  address: string;
  coords: { lat: number; lng: number };
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

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

function buildPrompt(input: LocationSuggestInput): string {
  const hint = [input.prefecture, input.city, input.area]
    .filter(Boolean)
    .join(" ");
  return [
    "あなたは日本の撮影ロケ地プラットフォームの編集者です。",
    "次の施設名について、web_search で実在の所在地（正式な住所）を確認してください。",
    "同名の別施設・別チェーン店と混同しないよう、渡された手がかり（都道府県/市区町村/エリア）",
    "と矛盾しない候補を優先してください。",
    "",
    `■ 施設名: ${input.title || "（不明）"}`,
    input.studioType ? `■ 種別: ${input.studioType}` : "",
    hint ? `■ 手がかり（既存入力）: ${hint}` : "",
    "",
    "見つかった住所から、以下を JSON で返してください:",
    '  address: 確認できた正式な住所（番地まで。都道府県から書く）',
    '  prefecture: 都道府県名のみ（例: "東京都"）',
    '  city: 市区町村名のみ（例: "江東区"）',
    `  area: 次のリストから最も近いものを1つ選ぶ: ${AREA_SUGGESTIONS.join("、")}`,
    "",
    "住所が確認できない場合は、address を空文字にして返してください（推測で埋めない）。",
    '形式: {"address": "...", "prefecture": "...", "city": "...", "area": "..."}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parseLocation(
  resp: AnthropicResponse,
): { address: string; prefecture: string; city: string; area: string } | null {
  const text = resp.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
  const match = text.match(/\{[\s\S]*"address"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const address = typeof obj.address === "string" ? obj.address.trim() : "";
    if (!address) return null;
    return {
      address,
      prefecture: typeof obj.prefecture === "string" ? obj.prefecture.trim() : "",
      city: typeof obj.city === "string" ? obj.city.trim() : "",
      area: typeof obj.area === "string" ? obj.area.trim() : "",
    };
  } catch {
    return null;
  }
}

/**
 * Claude(web_search) で住所を特定 → geocodeAddress で座標に変換。
 * web_search 未対応アカウントの場合はツール無しで再試行（住所特定の精度は落ちる）。
 */
export async function suggestLocation(
  input: LocationSuggestInput,
): Promise<LocationSuggestResult | { error: string }> {
  if (!input.title.trim()) {
    return { error: "物件名を入力してから検索してください" };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: "AI検索は現在利用できません（APIキー未設定）" };
  }

  const TOOL_SETS = [
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
          badRequest = true;
          break;
        }
        if (!res.ok) throw new Error(`anthropic ${res.status}`);
        data = (await res.json()) as AnthropicResponse;
        if (data.stop_reason !== "pause_turn") break;
        messages = [...messages, { role: "assistant", content: data.content }];
      }
      if (badRequest) continue;

      const loc = data ? parseLocation(data) : null;
      if (!loc) continue;

      const coords = await geocodeAddress(loc.address);
      if (!coords) continue; // 住所は得たが座標化に失敗 → 次のツールセット/最終エラーへ

      return {
        prefecture: loc.prefecture,
        city: loc.city,
        area: loc.area,
        address: loc.address,
        coords,
      };
    } catch {
      /* 次のツールセットへ */
    }
  }

  return {
    error:
      "住所・座標を特定できませんでした。物件名にエリア名を含める、または座標欄へ手動で住所/URLを貼り付けてください。",
  };
}
