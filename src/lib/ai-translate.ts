import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { translatePropertyWithFallback, type TranslateInput, type TranslateResult, type WorkersAi } from "./ai-translate-core";

// 本体は ai-translate-core.ts（Next の外でも動く）。ここはサイト用に鍵を取り出して渡すだけ。
export * from "./ai-translate-core";

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

async function getWorkersAi(): Promise<WorkersAi | null> {
  try {
    const { env } = await getCloudflareContext();
    const ai = (env as Record<string, unknown>).AI as WorkersAi | undefined;
    return ai && typeof ai.run === "function" ? ai : null;
  } catch {
    return null;
  }
}

// 定期処理（english-fill-job）と同じく、Anthropic がだめなら Workers AI に回す（2026-09-29）。
// 以前はボタン側（公開申請・申請メール）だけ Anthropic 専用で、キーが無効（401）になると
// 定期処理では訳せるのにボタンは「翻訳が完了していない」で止まっていた（スタジオカーニヴァル）。
export async function translateProperty(input: TranslateInput): Promise<TranslateResult> {
  return translatePropertyWithFallback(input, { apiKey: await getApiKey(), ai: await getWorkersAi() });
}
