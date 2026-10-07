import "server-only";

/**
 * Cloudflare Turnstile のトークン照合（公開フォームのボット対策）。
 * 秘密鍵は Worker の secret `TURNSTILE_SECRET_KEY`。
 *
 * ⚠ 秘密鍵が未設定の環境（手元の dev 等）では照合を飛ばして通す。既存の
 *   ハニーポット・時間ガード・レート制限・本文判定はそのまま効いている。
 */
export const TURNSTILE_ERROR = "ボット確認に失敗しました。チェックが完了してから再度送信してください。";

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);
    if (ip) body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    // Cloudflare 側の障害で問い合わせを全部止めない（他の防御は効いている）。
    console.error("[turnstile] siteverify に失敗（通す）:", e);
    return true;
  }
}
