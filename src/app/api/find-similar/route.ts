import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { findSimilarProperties } from "@/lib/find-similar";
import { allowByRate } from "@/lib/inquiry-guard";

export const runtime = "nodejs";

/**
 * suggest-summary/suggest-tags と同じくRoute Handlerとして実装する。
 * Server Action("use server")内では getCloudflareContext() 経由の
 * ANTHROPIC_API_KEY 取得が実機で機能しなかった（常にheuristicへ落ちる不具合を
 * 確認済み）ため、確実に動くRoute Handlerパターンに合わせている。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ ok: false, error: "URLを入力してください。" }, { status: 400 });
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
    const en = (req.headers.get("referer") ?? "").includes("/en/");
    return NextResponse.json(
      { ok: false, error: en ? "Please sign in to use this search." : "この検索はログインしてご利用ください（無料登録で使えます）。" },
      { status: 401 },
    );
  }
  if (!allowByRate(source, "similar-search")) {
    return NextResponse.json(
      { ok: false, error: "短時間に検索が集中しています。しばらく時間をおいて再度お試しください。" },
      { status: 429 },
    );
  }

  const result = await findSimilarProperties(url);
  return NextResponse.json(result);
}
