import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare の Rate Limiting バインディングによる回数制限（2026-10-23 セキュリティ監査）。
 *
 * inquiry-guard の allowByRate は Worker インスタンスのメモリで数えるので、インスタンスが
 * 分かれる・IP を変える、で実質効かない。こちらは Cloudflare 側で数えるので全インスタンス共通。
 * 期間は 60 秒（バインディングの上限）なので「短時間の連打」を止める役。1時間あたりの上限は
 * これまでどおり allowByRate が持つ。両方を通ったときだけ受け付ける。
 *
 * 上限は wrangler.jsonc の ratelimits で決める:
 *   RL_FORMS   … お問い合わせ・物件問い合わせ・似た物件検索（送信元ごと 3回/60秒）
 *   RL_UPLOADS … スタジオの写真提出・差し替え（送信元ごと 20回/60秒）
 *
 * バインディングが無い環境（手元の dev 等）や照会に失敗したときは通す。
 * 他の防御（メモリの回数制限・Turnstile・ハニーポット）はそのまま効いている。
 */
type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

export async function allowByEdgeRate(
  binding: "RL_FORMS" | "RL_UPLOADS",
  source: string,
  scope: string,
): Promise<boolean> {
  if (!source) return true;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const rl = (env as Record<string, unknown>)[binding] as RateLimiter | undefined;
    if (!rl || typeof rl.limit !== "function") return true;
    const { success } = await rl.limit({ key: `${scope}|${source}` });
    return success;
  } catch (e) {
    console.warn("[edge-rate] limiter unavailable, allowing:", e);
    return true;
  }
}
