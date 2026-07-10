/**
 * 物件掲示板コメントの荒らし防止コンテンツ検査。
 * postCommentAction からのみ呼ばれる純粋関数（server-only ではない、副作用なし）。
 */

/**
 * 制御文字（C0: 0x00-0x1F, DEL: 0x7F, C1: 0x80-0x9F）と
 * ゼロ幅文字（ZWSP 0x200B, ZWNJ 0x200C, ZWJ 0x200D, BOM/ZWNBSP 0xFEFF）を除去する。
 * 荒らしがこれらの文字でURL検知・連続文字検知・文字数制限をすり抜けるのを防ぐ。
 * 生の制御/不可視文字をソースに書かず、charCode から動的に正規表現を組み立てる
 * （エディタ/ツール経由で不可視文字が破損・変質するのを避けるため）。
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

export function validateCommentBody(
  body: string,
): { ok: true; cleaned: string } | { ok: false; error: string } {
  const cleaned = stripInvisible(body).trim();

  if (!cleaned) {
    return { ok: false, error: "コメントを入力してください。" };
  }

  const urlMatches = cleaned.match(/https?:\/\//g);
  if (urlMatches && urlMatches.length >= 3) {
    return { ok: false, error: "URLを多く含む投稿はできません。" };
  }

  if (/(.)\1{49,}/.test(cleaned)) {
    return { ok: false, error: "不正な内容が含まれています。" };
  }

  if (cleaned.length > 1000) {
    return { ok: false, error: "コメントは1000文字以内で入力してください。" };
  }

  return { ok: true, cleaned };
}
