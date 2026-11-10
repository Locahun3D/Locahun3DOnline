import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getPublishedProperties } from "./properties";
import { categoryLabel } from "./schemas";

/**
 * カタログの「AI検索」（2026-11-11 本人指示「AI検索機能にしたい。カタログに
 * 載っていないところも検索で引っかかるようにしたい」）。
 *
 * 入力は URL でも言葉でもよい（例: 「昭和のスナック」「工場の屋上」）。返すのは2種類:
 *  1. matches … カタログ（公開中の物件）から近い順に最大5件。id はカタログと照合し、
 *     カタログに無い id は捨てる。
 *  2. outside … カタログに無い実在の場所の候補（最大5件）。web_search の検索結果に
 *     実際に出てきた URL を出典として持つものだけを残す（AIが作った名前・URLは出さない）。
 *     それでも中身は未確認なので、画面では「未掲載・未確認」と明記する。
 *
 * 費用の抑え方: 同じ問い合わせは KV（WORKS_KV の `aisearch:` 接頭辞・7日）と
 * メモリに保存して API を呼ばない／ログイン必須＋IPごとの回数制限（route 側）／
 * web_search 3回・web_fetch 1回まで／effort low・出力上限 4000 トークン。
 *
 * ANTHROPIC_API_KEY が無いとき: カタログだけをキーワード一致で返す（outside は空）。
 * 手元確認用に AI_SEARCH_MOCK=1 で固定の結果を返す（本番では立てない）。
 */

export interface SimilarMatch {
  id: string;
  title: string;
  reason: string;
}

/** カタログに無い場所の候補。sourceUrl は web_search の結果に実在した URL だけ。 */
export interface OutsideCandidate {
  name: string;
  area: string;
  reason: string;
  sourceUrl: string;
}

export type AiSearchSource = "ai" | "heuristic" | "mock";

export type AiSearchResult =
  | {
      ok: true;
      matches: SimilarMatch[];
      outside: OutsideCandidate[];
      source: AiSearchSource;
      cached?: boolean;
    }
  | { ok: false; error: string };

const MODEL = "claude-opus-5-5";
const MAX_QUERY = 300;
const CACHE_TTL_S = 60 * 60 * 24 * 7;
const CACHE_PREFIX = "aisearch:v1:";

async function getEnv(): Promise<Record<string, unknown> | null> {
  try {
    const { env } = await getCloudflareContext();
    return env as Record<string, unknown>;
  } catch {
    return null; /* not on Workers */
  }
}

async function getApiKey(): Promise<string | null> {
  const env = await getEnv();
  const k = env?.ANTHROPIC_API_KEY;
  if (typeof k === "string" && k) return k;
  return process.env.ANTHROPIC_API_KEY || null;
}

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 表記ゆれでキャッシュが割れないように: 前後空白・連続空白・全角空白・大文字小文字。 */
export function normalizeQuery(raw: string): string {
  const s = raw.replace(/　/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  return isHttpUrl(s) ? s : s.toLowerCase();
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

/** 日本語は空白で区切られないので Intl.Segmenter で語に分ける。URL はホスト名とパス。 */
function queryWords(query: string): string[] {
  let text = query;
  if (isHttpUrl(query)) {
    const u = new URL(query);
    text = `${u.hostname} ${decodeURIComponent(u.pathname)}`;
  }
  const out = new Set<string>();
  try {
    const seg = new Intl.Segmenter("ja", { granularity: "word" });
    for (const s of seg.segment(text.toLowerCase())) {
      if (s.isWordLike && s.segment.length >= 2) out.add(s.segment);
    }
  } catch {
    for (const w of text.toLowerCase().split(/[^a-z0-9ぁ-んァ-ヶ一-龠ー]+/)) if (w.length >= 2) out.add(w);
  }
  return [...out];
}

/** API キー無し／AI 失敗時: 語がタイトル・タグ・紹介文に含まれる数で並べる。 */
function heuristicMatch(query: string, rows: CatalogRow[], en: boolean): SimilarMatch[] {
  const words = queryWords(query);
  if (!words.length) return [];
  return rows
    .map((r) => {
      const hay = `${r.title} ${r.category} ${r.area} ${r.tags.join(" ")} ${r.summary}`.toLowerCase();
      return { r, score: words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => ({ id: x.r.id, title: x.r.title, reason: en ? "Keyword match" : "キーワードが一致" }));
}

/* ---------- Anthropic Messages API（生 fetch。リポの他の AI ヘルパーと同じ形） ---------- */

interface AnthropicBlock {
  type: string;
  text?: string;
  content?: unknown;
  citations?: Array<{ url?: string }>;
}
interface AnthropicResponse {
  content: AnthropicBlock[];
  stop_reason: string;
}

function buildPrompt(query: string, digest: string, en: boolean): string {
  const isUrl = isHttpUrl(query);
  const lang = en ? "英語" : "日本語";
  return [
    "あなたは日本の撮影ロケ地プラットフォーム「ロケハン3D」の検索アシスタントです。",
    "ユーザーは映像・写真の制作者で、撮影に使える場所を探しています。",
    isUrl
      ? `ユーザーが参考として貼ったページ: ${query}\nweb_fetch でこのページを1回だけ取得し、写っている（または説明されている）空間の雰囲気・種別・用途をつかんでください。取得できなければ URL の文字列から推測してください。`
      : `ユーザーの検索語: 「${query}」\nこの言葉が表す空間の雰囲気・種別・用途を考えてください。`,
    "",
    "やること1: 下の「掲載物件一覧」から、雰囲気・種別・用途が近いものを最大5件、近い順に選ぶ。無理に選ばない（該当なしなら空配列）。",
    "やること2: 掲載物件一覧に無い、日本国内に実在して撮影に使えそうな場所（撮影スタジオ・レンタルスペース・ロケ地・施設）を web_search で探し、最大5件挙げる。",
    "  - 必ず web_search の検索結果に出てきたページの URL を sourceUrl に入れる。検索結果に無い URL を作らない。",
    "  - 検索結果で実在が確かめられない場所は挙げない。住所・料金・営業時間など、確かめていない細部は書かない。",
    "  - 掲載物件一覧にある物件と同じ場所は除く。",
    "",
    "掲載物件一覧:",
    digest,
    "",
    `reason は${lang}で20〜40字。name と area は検索結果の表記どおり（area は都道府県＋市区町村まで）。`,
    "最後に、次の JSON だけを返してください（前後に説明文を付けない）:",
    '{"matches":[{"id":"掲載物件一覧のid","reason":"…"}],"outside":[{"name":"…","area":"…","reason":"…","sourceUrl":"https://…"}]}',
  ].join("\n");
}

/** レスポンス全体から、検索・取得ツールの結果に実際に現れた URL を集める（出典の照合用）。 */
function collectToolUrls(blocks: AnthropicBlock[]): Set<string> {
  const urls = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.url === "string") urls.add(normUrl(o.url));
    for (const k of Object.keys(o)) if (k !== "text") walk(o[k]);
  };
  for (const b of blocks) {
    if (b.type.endsWith("_tool_result")) walk(b.content);
    if (b.citations) walk(b.citations);
  }
  return urls;
}

function normUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

interface RawResult {
  matches: { id: string; reason: string }[];
  outside: { name: string; area: string; reason: string; sourceUrl: string }[];
}

export function parseResult(text: string): RawResult | null {
  // 最後の {"matches" … } を拾う（思考の途中に出た例示 JSON を避ける）。
  const start = text.lastIndexOf('{"matches"');
  const from = start >= 0 ? start : text.search(/\{\s*"matches"/);
  if (from < 0) return null;
  const end = text.lastIndexOf("}");
  if (end <= from) return null;
  try {
    const obj = JSON.parse(text.slice(from, end + 1)) as Record<string, unknown>;
    const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
    const matches = Array.isArray(obj.matches)
      ? obj.matches
          .filter((m) => m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string")
          .map((m) => ({ id: str((m as { id: string }).id, 80), reason: str((m as { reason?: unknown }).reason, 80) }))
      : [];
    const outside = Array.isArray(obj.outside)
      ? obj.outside
          .filter((m) => m && typeof m === "object")
          .map((m) => {
            const o = m as Record<string, unknown>;
            return {
              name: str(o.name, 60),
              area: str(o.area, 40),
              reason: str(o.reason, 80),
              sourceUrl: str(o.sourceUrl, 500),
            };
          })
      : [];
    return { matches, outside };
  } catch {
    return null;
  }
}

/** AI の出力をカタログ・検索結果と突き合わせて、表示してよいものだけにする。 */
export function reconcile(
  raw: RawResult,
  rows: { id: string; title: string }[],
  seenUrls: Set<string>,
): { matches: SimilarMatch[]; outside: OutsideCandidate[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const matches: SimilarMatch[] = [];
  for (const m of raw.matches) {
    const row = byId.get(m.id);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    matches.push({ id: row.id, title: row.title, reason: m.reason });
    if (matches.length >= 5) break;
  }
  const titles = rows.map((r) => r.title.replace(/\s+/g, "").toLowerCase());
  const outside: OutsideCandidate[] = [];
  const names = new Set<string>();
  for (const o of raw.outside) {
    if (!o.name || !isHttpUrl(o.sourceUrl)) continue;
    if (!seenUrls.has(normUrl(o.sourceUrl))) continue; // 検索結果に無い URL ＝作られた可能性 → 出さない
    const key = o.name.replace(/\s+/g, "").toLowerCase();
    if (names.has(key) || titles.some((t) => t && (t.includes(key) || key.includes(t)))) continue;
    names.add(key);
    outside.push(o);
    if (outside.length >= 5) break;
  }
  return { matches, outside };
}

async function callClaude(apiKey: string, prompt: string, isUrl: boolean): Promise<AnthropicBlock[] | null> {
  const search = { type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "JP" } };
  const fetchTool = { type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, max_content_tokens: 8000 };
  // 400（ツール未対応など）のときは次の組み合わせへ。最後はツール無し
  // （その場合 outside は出典が照合できないので必ず空になる）。
  const TOOL_SETS: unknown[][] = isUrl ? [[search, fetchTool], [fetchTool], []] : [[search], []];
  for (const tools of TOOL_SETS) {
    const base: Record<string, unknown> = {
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low" },
      fallbacks: "default",
    };
    if (tools.length) base.tools = tools;
    let messages: Array<{ role: string; content: unknown }> = [{ role: "user", content: prompt }];
    const all: AnthropicBlock[] = [];
    let bad = false;
    for (let i = 0; i < 4; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
        },
        body: JSON.stringify({ ...base, messages }),
      });
      if (res.status === 400) {
        bad = true;
        break;
      }
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const data = (await res.json()) as AnthropicResponse;
      if (data.stop_reason === "refusal") return null;
      all.push(...data.content);
      if (data.stop_reason !== "pause_turn") return all;
      messages = [...messages, { role: "assistant", content: data.content }];
    }
    if (!bad) return all; // pause_turn が続いたまま上限 → 手元にある分で判定
  }
  return null;
}

/* ---------- キャッシュ ---------- */

const mem = new Map<string, { at: number; value: AiSearchResult }>();

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

async function getKv(): Promise<KvLike | null> {
  const env = await getEnv();
  const kv = env?.WORKS_KV as KvLike | undefined;
  return kv && typeof kv.get === "function" ? kv : null;
}

async function cacheGet(key: string): Promise<AiSearchResult | null> {
  const m = mem.get(key);
  if (m && Date.now() - m.at < CACHE_TTL_S * 1000) return m.value;
  try {
    const kv = await getKv();
    const s = kv ? await kv.get(key) : null;
    if (s) {
      const v = JSON.parse(s) as AiSearchResult;
      mem.set(key, { at: Date.now(), value: v });
      return v;
    }
  } catch {
    /* キャッシュ無しで続ける */
  }
  return null;
}

async function cachePut(key: string, value: AiSearchResult): Promise<void> {
  if (mem.size > 300) mem.delete(mem.keys().next().value as string);
  mem.set(key, { at: Date.now(), value });
  try {
    const kv = await getKv();
    if (kv) await kv.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_S });
  } catch {
    /* 保存できなくても結果は返す */
  }
}

/* ---------- 手元確認用モック（AI_SEARCH_MOCK=1） ---------- */

function mockResult(query: string, rows: CatalogRow[], en: boolean): AiSearchResult {
  const hits = heuristicMatch(query, rows, en);
  const matches = (hits.length ? hits : rows.slice(0, 3).map((r) => ({ id: r.id, title: r.title, reason: "" }))).map(
    (m) => ({ ...m, reason: en ? "[mock] Similar mood and use" : "【モック】雰囲気・用途が近い" }),
  );
  const outside: OutsideCandidate[] = [
    {
      name: en ? "[mock] Retro snack bar set" : "【モック】昭和レトロなスナック風スタジオ",
      area: en ? "Tokyo, Setagaya" : "東京都世田谷区",
      reason: en ? "[mock] Showa-era bar counter and neon" : "【モック】昭和のカウンターとネオン看板がある",
      sourceUrl: "https://example.com/mock-1",
    },
    {
      name: en ? "[mock] Factory rooftop" : "【モック】工場の屋上ロケ地",
      area: en ? "Kanagawa, Kawasaki" : "神奈川県川崎市",
      reason: en ? "[mock] Wide rooftop with industrial skyline" : "【モック】工業地帯を背景にした広い屋上",
      sourceUrl: "https://example.com/mock-2",
    },
  ];
  return { ok: true, matches, outside, source: "mock" };
}

/* ---------- 入口 ---------- */

export async function findSimilarProperties(rawQuery: string, opts: { en?: boolean } = {}): Promise<AiSearchResult> {
  const en = !!opts.en;
  const query = normalizeQuery(rawQuery);
  if (query.length < 2) {
    return { ok: false, error: en ? "Enter a URL or a few words." : "URLか、探したい場所の言葉を入れてください。" };
  }

  const rows = await buildCatalogRows();
  if (process.env.AI_SEARCH_MOCK === "1") return mockResult(query, rows, en);

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: true, matches: heuristicMatch(query, rows, en), outside: [], source: "heuristic" };
  }

  // カタログが変わったら別キーになるよう、id 一覧も鍵に混ぜる。
  const key = CACHE_PREFIX + (await sha256(`${en ? "en" : "ja"}\n${query}\n${rows.map((r) => r.id).join(",")}`));
  const hit = await cacheGet(key);
  if (hit && hit.ok) return { ...hit, cached: true };

  try {
    const blocks = await callClaude(apiKey, buildPrompt(query, catalogDigest(rows), en), isHttpUrl(query));
    if (blocks) {
      const text = blocks
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text as string)
        .join("");
      const raw = parseResult(text);
      if (raw) {
        const value: AiSearchResult = { ok: true, ...reconcile(raw, rows, collectToolUrls(blocks)), source: "ai" };
        await cachePut(key, value);
        return value;
      }
    }
  } catch {
    /* heuristic へ */
  }
  return { ok: true, matches: heuristicMatch(query, rows, en), outside: [], source: "heuristic" };
}
