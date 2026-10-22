"use server";

import { redirect } from "next/navigation";

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
