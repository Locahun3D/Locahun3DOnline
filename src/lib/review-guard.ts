/**
 * レビュー本文の荒らし防止コンテンツ検査。
 * postOrUpdateReviewAction からのみ呼ばれる純粋関数（server-only ではない、副作用なし）。
 * comment-guard.ts と同じロジック（本文は任意なので空文字は許容する点のみ異なる）。
 */

/**
 * 制御文字（C0: 0x00-0x1F, DEL: 0x7F, C1: 0x80-0x9F）と
 * ゼロ幅文字（ZWSP 0x200B, ZWNJ 0x200C, ZWJ 0x200D, BOM/ZWNBSP 0xFEFF）を除去する。
 */
function stripInvisible(body: string): string {
  let out = "";
  for (const ch of body) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = (code <= 0x1f) || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    const isZeroWidth = code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff;
    if (isControl || isZeroWidth) continue;
    out += ch;
  }
  return out;
}

export function validateReviewBody(
  body: string,
): { ok: true; cleaned: string } | { ok: false; error: string } {
  const cleaned = stripInvisible(body).trim();

  // 本文は任意（星のみ投稿可）なので空文字は許容する。
  if (!cleaned) {
    return { ok: true, cleaned: "" };
  }

  const urlMatches = cleaned.match(/https?:\/\//g);
  if (urlMatches && urlMatches.length >= 3) {
    return { ok: false, error: "URLを多く含む投稿はできません。" };
  }

  if (/(.)\1{49,}/.test(cleaned)) {
    return { ok: false, error: "不正な内容が含まれています。" };
  }

  if (cleaned.length > 1000) {
    return { ok: false, error: "レビューは1000文字以内で入力してください。" };
  }

  return { ok: true, cleaned };
}

export function validateRating(raw: unknown): { ok: true; rating: number } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, error: "評価は星1〜5で指定してください。" };
  }
  return { ok: true, rating: n };
}
