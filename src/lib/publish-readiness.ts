import { publishablePropertySchema } from "./schemas";

/**
 * 公開申請できる状態か（＝3DGS以外の入力が揃っているか）の判定。
 *
 * ── なぜ要るか ────────────────────────────────────────────
 * 申請は「掲載ページを作り終えたら出す」もの。中身が空のまま申請されると、
 * 運営は3DGSを撮りに行く前に不足項目を1件ずつ問い合わせることになり、
 * 申請の意味がなくなる（2026-07-30 の方針: 3DGS以外が揃っていないと申請不可）。
 *
 * ⚠ 判定は publishablePropertySchema をそのまま使う。同スキーマは元々
 *   **3DGS を必須にしていない**（写真のみ掲載枠のため）ので、
 *   「3DGS以外が揃っているか」の定義と完全に一致する。
 *   別の条件を書き足すと公開時の検証と二重管理になり必ずズレる。
 * ⚠ ここは表示用。実際の強制は requestPublishAction 側で同じ関数を呼んで行う
 *   （二重防御。UIを迂回した POST を通さない）。
 */

/** 画面に出す項目名。zod の path をユーザーに分かる日本語へ。 */
const FIELD_LABEL: Record<string, string> = {
  title: "物件名",
  area: "エリア",
  prefecture: "都道府県",
  city: "市区町村",
  summary: "紹介文（サマリー）",
  "cover.src": "カバー画像",
  "cover.alt": "カバー画像の代替テキスト",
  hourlyPrice: "時間料金",
  category: "カテゴリ",
};

export interface PublishReadiness {
  ready: boolean;
  /** 足りない項目の表示名（重複なし・入力順）。 */
  missing: string[];
}

export function publishReadiness(property: unknown): PublishReadiness {
  const parsed = publishablePropertySchema.safeParse(property);
  if (parsed.success) return { ready: true, missing: [] };

  const missing: string[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    // 未知のパスはそのまま出す（黙って落とすと「何が足りないのか分からない」に戻る）
    const label = FIELD_LABEL[path] ?? path;
    if (!missing.includes(label)) missing.push(label);
  }
  return { ready: false, missing };
}
