"use server";

import { redirect } from "next/navigation";
import { userRepo } from "./users";
import { TOKEN_PACK } from "./schemas";

/**
 * トークン単品購入（5枚 ¥3,000）は **2026-08-13 に廃止**。
 *
 * 撤去したもの: 料金ページ／マイページの購入カード、Stripe Checkout の作成、
 * 戻りルート `/api/token-pack/return`、`tokenPackPriceId()`。
 * これで「トークンを買い足す」導線はサイトのどこにも存在しない。
 *
 * ⚠ **月額プランでトークンが付与される仕組み（サブスク本体）は無関係**。
 *   `purchasedTokens` の残高と消費ロジックも触っていない — 廃止前に買った人の
 *   残高は失効日まで従来どおり使える。
 */

/** 購入から N ヶ月後の ISO 文字列。 */
function monthsFrom(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * 支払い済みトークンパックの付与（**廃止済み機能の後始末専用**）。
 *
 * 新規の Checkout はもう作れないので通常は発火しない。廃止のデプロイ前に
 * Stripe の決済画面を開いたままだった人の `checkout.session.completed` が
 * 後から届いた場合に、支払わせたまま付与しない事故を防ぐためだけに残す。
 * デプロイから数週間経ったら webhook の分岐ごと削除してよい。
 *
 * 冪等: sessionId を tokenPackSessions に記録し、既にあれば何もしない。
 */
export async function grantTokenPack(
  userId: string,
  sessionId: string,
  tokens: number = TOKEN_PACK.tokens,
): Promise<boolean> {
  let granted = false;
  await userRepo.grantTokens(userId, (u) => {
    const seen = u.tokenPackSessions ?? [];
    if (seen.includes(sessionId)) return u; // 付与済み — 何もしない
    granted = true;
    const now = new Date().toISOString();
    return {
      ...u,
      purchasedTokens: (u.purchasedTokens ?? 0) + tokens,
      purchasedTokensExpiresAt: monthsFrom(now, TOKEN_PACK.expiryMonths),
      tokenPackSessions: [sessionId, ...seen].slice(0, 50),
    };
  });
  return granted;
}

/**
 * 旧「トークンを追加購入」アクション。購入処理は撤去済みで、押しても
 * 決済は一切始まらず料金ページへ送るだけ。
 *
 * ⚠ 残している理由: `src/components/viewer-gate.tsx` にまだ旧ボタンの
 *   マークアップが残っており（同ファイルは別作業中のため今回未編集）、
 *   export を消すとビルドが落ちるため。viewer-gate 側のボタンを削除したら
 *   この関数ごと消してよい。
 */
export async function buyTokenPackAction(): Promise<void> {
  redirect("/pricing");
}
