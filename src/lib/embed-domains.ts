/**
 * 埋め込み（/embed/<token>）を貼ってよいサイトの制限（2026-10-08・利用規約 第7条）。
 *
 * 埋め込みごとに「許可するドメイン」を運営が設定できる。空なら従来どおりどこにでも貼れる
 * （既存のスタジオの埋め込みを壊さないため）。設定があれば:
 *   1. 応答に `Content-Security-Policy: frame-ancestors 'self' <許可リスト>` を付ける（本命。middleware）
 *   2. iframe の中で document.referrer を見て、許可外なら表示しない（補助。CSP が付かない経路の保険）
 *
 * 純関数のみ（middleware・client component・server のどこからでも import してよい。server-only 禁止）。
 */

/** 1つの埋め込みに設定できるドメインの上限（ヘッダーの肥大化を防ぐ）。 */
export const MAX_ALLOWED_DOMAINS = 20;

/** 正規化済みの許可エントリ。例: "https://example.com" / "https://*.example.com" / "http://localhost:8080"。 */
export type AllowedDomain = string;

const HOST_RE = /^(\*\.)?([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * 1行の入力を正規化する。不正なら null。
 *  - スキーム省略時は https。http/https 以外は不可
 *  - パス・クエリ・末尾のスラッシュは捨てる（frame-ancestors はオリジン単位）
 *  - 先頭の "*." だけワイルドカードを許す（サブドメイン全部）
 *  - 小文字にそろえる
 */
export function normalizeAllowedDomain(raw: string): AllowedDomain | null {
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  let scheme = "https";
  const m = /^([a-z][a-z0-9+.-]*):\/\//.exec(s);
  if (m) {
    if (m[1] !== "http" && m[1] !== "https") return null;
    scheme = m[1];
    s = s.slice(m[0].length);
  }
  s = s.replace(/[/?#].*$/, "");
  let port = "";
  const pm = /:(\d{1,5})$/.exec(s);
  if (pm) {
    const n = Number(pm[1]);
    if (n < 1 || n > 65535) return null;
    port = `:${n}`;
    s = s.slice(0, -pm[0].length);
  }
  if (!s || s.length > 253 || !HOST_RE.test(s)) return null;
  // "*.com" のようにトップレベルだけのワイルドカードは不可（全サイト許可と同じになる）。
  if (s.startsWith("*.") && !s.slice(2).includes(".")) return null;
  return `${scheme}://${s}${port}`;
}

/**
 * 管理画面のテキスト（カンマ・改行・空白区切り）を許可リストにする。
 * 重複は除き、不正な行は invalid に返す（保存前に画面へ出す）。
 */
export function parseAllowedDomains(text: string): { domains: AllowedDomain[]; invalid: string[] } {
  const parts = String(text ?? "")
    .split(/[\s,、，;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const domains: AllowedDomain[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    const n = normalizeAllowedDomain(p);
    if (!n) invalid.push(p);
    else if (!domains.includes(n)) domains.push(n);
  }
  return { domains: domains.slice(0, MAX_ALLOWED_DOMAINS), invalid };
}

/** 保存済みの値（不正・未設定を含みうる）から、安全な許可リストだけを取り出す。 */
export function sanitizeAllowedDomains(v: unknown): AllowedDomain[] {
  if (!Array.isArray(v)) return [];
  const out: AllowedDomain[] = [];
  for (const x of v) {
    const n = typeof x === "string" ? normalizeAllowedDomain(x) : null;
    if (n && !out.includes(n)) out.push(n);
  }
  return out.slice(0, MAX_ALLOWED_DOMAINS);
}

/**
 * frame-ancestors の CSP 値。許可リストが空なら null（ヘッダーを付けない＝従来どおりどこでも貼れる）。
 * 'self' は常に含める（運営の管理画面・確認用の同一オリジン表示を壊さない）。
 */
export function buildFrameAncestorsCsp(domains: readonly string[]): string | null {
  const list = sanitizeAllowedDomains(domains);
  if (list.length === 0) return null;
  return `frame-ancestors 'self' ${list.join(" ")}`;
}

function hostMatches(pattern: string, host: string): boolean {
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host.endsWith(`.${base}`);
  }
  return host === pattern;
}

/**
 * iframe の親ページ（document.referrer）が許可リストに入っているか（補助のチェック）。
 *  - 許可リストが空 → 常に true
 *  - referrer が空（リファラーを送らない設定・直接開いた）→ true（判定できないので止めない。本命は CSP）
 *  - 自サイト（selfOrigin）→ true
 */
export function isReferrerAllowed(
  referrer: string | null | undefined,
  domains: readonly string[],
  selfOrigin?: string,
): boolean {
  const list = sanitizeAllowedDomains(domains);
  if (list.length === 0) return true;
  if (!referrer) return true;
  let ref: URL;
  try {
    ref = new URL(referrer);
  } catch {
    return true;
  }
  if (selfOrigin && ref.origin === selfOrigin) return true;
  const port = ref.port ? `:${ref.port}` : "";
  for (const entry of list) {
    const m = /^(https?):\/\/(.+?)(:\d+)?$/.exec(entry);
    if (!m) continue;
    const [, scheme, host, entryPort = ""] = m;
    if (`${scheme}:` !== ref.protocol) continue;
    if (entryPort !== port) continue;
    if (hostMatches(host, ref.hostname)) return true;
  }
  return false;
}

/** /embed/<token>（/en/embed/<token> を含む）のトークン。該当しなければ null。 */
export function embedTokenFromPath(pathname: string): string | null {
  const m = /^(?:\/en)?\/embed\/([A-Za-z0-9_-]{6,64})\/?$/.exec(pathname);
  return m ? m[1] : null;
}
