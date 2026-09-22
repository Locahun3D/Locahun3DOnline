/**
 * 自動英訳の定期実行（Cron）だけが呼べるようにする印（2026-09-23）。
 *
 * 新しい秘密の値は増やさない。サーバーが既に持っている ANTHROPIC_API_KEY から作った
 * SHA-256 を印にする。キーを知らない外部の人は作れない。キーそのものは送らない。
 * custom-worker.ts（定期実行の入口）と /api/internal/english-fill の両方がこれを使う。
 */
export async function englishFillToken(apiKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(`locahun3d:english-fill:v1:${apiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 長さの違い・中身の違いで早く抜けない比較（印の当て推量をしにくくする）。 */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
