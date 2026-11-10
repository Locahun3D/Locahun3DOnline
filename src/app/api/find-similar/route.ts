import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { findSimilarProperties } from "@/lib/find-similar";
import { allowByRate } from "@/lib/inquiry-guard";
import { allowByEdgeRate } from "@/lib/edge-rate";

export const runtime = "nodejs";

/** 1ユーザーあたり1時間の上限（isolate ごと）。RL_FORMS（60秒3回）と二重にかける。 */
const HOURLY_MAX = 15;

/**
 * カタログの AI 検索（URL または言葉）。suggest-summary/suggest-tags と同じく Route Handler。
 * Server Action("use server")内では getCloudflareContext() 経由の
 * ANTHROPIC_API_KEY 取得が実機で機能しなかった（常にheuristicへ落ちる不具合を
 * 確認済み）ため、確実に動くRoute Handlerパターンに合わせている。
 * 入力は `query`。旧クライアント互換で `url` も受ける。
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { query?: unknown; url?: unknown; locale?: unknown };
  const en = body.locale === "en" || (req.headers.get("referer") ?? "").includes("/en/");
  const query = String(body.query ?? body.url ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { ok: false, error: en ? "Enter a URL or a few words." : "URLか、探したい場所の言葉を入れてください。" },
      { status: 400 },
    );
  }

  // 2026-10-23 セキュリティ監査: 未ログインでも Claude（web_fetch つき）を呼べ、API 課金の踏み台に
  // なっていた。ログインを必須にし、回数制限もユーザー単位にする。
  let source = "";
  try {
    const { userId } = await auth();
    if (userId) source = `u:${userId}`;
  } catch {
    /* 認証が取れない＝未ログイン扱い */
  }
  if (!source) {
    return NextResponse.json(
      { ok: false, error: en ? "Please sign in to use this search." : "この検索はログインしてご利用ください（無料登録で使えます）。" },
      { status: 401 },
    );
  }
  if (!allowByRate(source, "similar-search", HOURLY_MAX) || !(await allowByEdgeRate("RL_FORMS", source, "similar"))) {
    return NextResponse.json(
      {
        ok: false,
        error: en
          ? "Too many searches in a short time. Please try again later."
          : "短時間に検索が集中しています。しばらく時間をおいて再度お試しください。",
      },
      { status: 429 },
    );
  }

  const result = await findSimilarProperties(query, { en });
  return NextResponse.json(result);
}
