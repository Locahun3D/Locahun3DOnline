import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { translatePropertyWithKey, type TranslateInput, type TranslateResult } from "./ai-translate-core";

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

export async function translateProperty(input: TranslateInput): Promise<TranslateResult> {
  return translatePropertyWithKey(input, await getApiKey());
}
