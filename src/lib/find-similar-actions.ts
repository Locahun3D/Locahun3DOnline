"use server";

import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { findSimilarProperties, type SimilarMatch } from "./find-similar";
import { allowByRate } from "./inquiry-guard";

export type FindSimilarState =
  | { ok: true; matches: SimilarMatch[] }
  | { ok: false; error: string }
  | undefined;

export async function findSimilarPropertiesAction(
  _prev: FindSimilarState,
  formData: FormData,
): Promise<FindSimilarState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, error: "URLを入力してください。" };

  let source = "";
  try {
    const { userId } = await auth();
    if (userId) {
      source = `u:${userId}`;
    } else {
      const h = await headers();
      source =
        h.get("cf-connecting-ip") ??
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "";
    }
  } catch {
    // ヘッダ/認証が取れない環境（ローカル等）はレート制限をスキップ。
  }
  if (!allowByRate(source, "similar-search")) {
    return {
      ok: false,
      error: "短時間に検索が集中しています。しばらく時間をおいて再度お試しください。",
    };
  }

  const result = await findSimilarProperties(url);
  if (!result.ok) return result;
  return { ok: true, matches: result.matches };
}
