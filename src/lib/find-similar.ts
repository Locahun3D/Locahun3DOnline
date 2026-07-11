import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getPublishedProperties } from "./properties";
import { categoryLabel } from "./schemas";

/**
 * URLを1件貼るだけで、カタログの中から雰囲気・用途が近い物件を選ぶ検索機能。
 * suggest-summary.ts / ai-tags.ts と同じ「ANTHROPIC_API_KEY あり=Claude(web_fetch)
 * で本文を読んで判定、無し=キーワード一致のフォールバック」パターン。
 */

export interface SimilarMatch {
  id: string;
  title: string;
  reason: string;
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

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface CatalogRow {
  id: string;
  title: string;
  category: string;
  area: string;
  tags: string[];
  summary: string;
}

async function buildCatalogRows(): Promise<CatalogRow[]> {
  const props = await getPublishedProperties();
  return props.map((p) => ({
    id: p.id,
    title: p.title,
    category: categoryLabel(p.category, "ja"),
    area: [p.prefecture, p.city].filter(Boolean).join(""),
    tags: p.tags,
    summary: p.summary,
  }));
}

function catalogDigest(rows: CatalogRow[]): string {
  return rows
    .map(
      (r) =>
        `- id:${r.id} | ${r.title} | ${r.category} | ${r.area} | tags:${r.tags.join("・") || "なし"} | ${r.summary}`,
    )
    .join("\n");
}

/** APIキー無しの場合のフォールバック: URLのホスト名・パスの単語をタグ/タイトルと素朴に照合。 */
function heuristicMatch(url: string, rows: CatalogRow[]): SimilarMatch[] {
  let words: string[] = [];
  try {
    const u = new URL(url);
    words = `${u.hostname} ${u.pathname}`
      .toLowerCase()
      .split(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/)
      .filter((w) => w.length >= 2);
  } catch {
    return [];
  }
  const scored = rows
    .map((r) => {
      const hay = `${r.title} ${r.category} ${r.area} ${r.tags.join(" ")} ${r.summary}`.toLowerCase();
      const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return scored.map((x) => ({
    id: x.r.id,
    title: x.r.title,
    reason: "URLのキーワードと一致",
  }));
}

interface AnthropicBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

function buildPrompt(url: string, digest: string): string {
  return [
    "あなたは日本の撮影ロケ地プラットフォームの検索アシスタントです。",
    `次のURLを web_fetch で取得し、そのページが表すロケーション・空間の雰囲気/種別/用途を把握してください: ${url}`,
    "取得できた特徴をもとに、下のロケーション候補一覧から、雰囲気・種別・用途が近いものを最大5件、近い順に選んでください。",
    "該当するものがなければ空配列を返してください（無理に選ばない）。",
    "",
    "候補一覧:",
    digest,
    "",
    "結果は次のJSON形式だけを返してください（候補一覧に無いidは使わないこと）:",
    '{"matches": [{"id": "候補一覧のid", "reason": "似ている理由を日本語20〜30字で"}]}',
  ].join("\n");
}

function parseMatches(resp: AnthropicResponse): { id: string; reason: string }[] {
  const text = resp.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");
  const match = text.match(/\{[\s\S]*"matches"[\s\S]*?\]\s*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]) as { matches?: unknown };
    if (!Array.isArray(obj.matches)) return [];
    return obj.matches
      .filter(
        (m): m is { id: string; reason: string } =>
          !!m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string",
      )
      .map((m) => ({ id: m.id, reason: String(m.reason ?? "").slice(0, 60) }));
  } catch {
    return [];
  }
}

export async function findSimilarProperties(
  url: string,
): Promise<{ ok: true; matches: SimilarMatch[]; source: "ai" | "heuristic" } | { ok: false; error: string }> {
  if (!isValidHttpUrl(url)) {
    return { ok: false, error: "有効なURL（http:// または https://）を入力してください。" };
  }

  const rows = await buildCatalogRows();
  if (rows.length === 0) {
    return { ok: true, matches: [], source: "heuristic" };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: true, matches: heuristicMatch(url, rows), source: "heuristic" };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const prompt = buildPrompt(url, catalogDigest(rows));

  // suggest-summary.ts と同じ多段フォールバック: web_fetch(+web_search) が
  // 400（アカウント未対応等）なら次のツールセットへ、最後はツール無しで再試行。
  // ここで諦めずに段階を踏まないと、1回の400だけで即ヒューリスティックへ
  // 落ちてしまい、AIによる本文照合が実質使われなくなる。
  const TOOL_SETS = [
    [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 }],
    [],
  ];

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

      const raw = data ? parseMatches(data) : [];
      const matches: SimilarMatch[] = raw
        .map((m) => {
          const row = byId.get(m.id);
          if (!row) return null;
          return { id: row.id, title: row.title, reason: m.reason || "似た雰囲気の物件です" };
        })
        .filter((m): m is SimilarMatch => !!m)
        .slice(0, 5);

      if (raw.length > 0 || matches.length > 0) {
        return { ok: true, matches, source: "ai" };
      }
      // 空配列（該当なし）もAI成功の正当な結果として扱う。
      if (data) return { ok: true, matches: [], source: "ai" };
    } catch {
      /* 次のツールセット、または heuristic へ */
    }
  }
  return { ok: true, matches: heuristicMatch(url, rows), source: "heuristic" };
}
