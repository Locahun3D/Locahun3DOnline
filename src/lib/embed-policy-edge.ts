import { buildFrameAncestorsCsp, sanitizeAllowedDomains } from "./embed-domains";

/**
 * middleware から呼ぶ「この埋め込みに付ける frame-ancestors」の取得（2026-10-08）。
 *
 * ⚠ middleware は全リクエストの入口。ここが throw・待ち続けると全ページが止まる。
 *   - D1 を1行読むだけ。失敗・タイムアウト・D1 が無い環境（next dev はローカルJSON）では null
 *     （＝ヘッダーを付けない＝従来どおりの挙動。補助の referrer チェックは画面側で効く）
 *   - "server-only" や node:fs を持つモジュール（property-embeds.ts・d1.ts）は import しない
 */
const LOOKUP_TIMEOUT_MS = 800;

type D1Like = {
  prepare(sql: string): { bind(...v: unknown[]): { first(): Promise<unknown> } };
};

export async function frameAncestorsForEmbed(token: string): Promise<string | null> {
  try {
    const lookup = (async () => {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      const db = (env as Record<string, unknown>).DB as D1Like | undefined;
      if (!db) return null;
      const row = (await db
        .prepare("SELECT data FROM property_embeds WHERE token = ?")
        .bind(token)
        .first()) as { data?: string } | null;
      if (!row?.data) return null;
      const embed = JSON.parse(row.data) as { allowedDomains?: unknown };
      return buildFrameAncestorsCsp(sanitizeAllowedDomains(embed.allowedDomains));
    })();
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS));
    return await Promise.race([lookup.catch(() => null), timeout]);
  } catch {
    return null;
  }
}
