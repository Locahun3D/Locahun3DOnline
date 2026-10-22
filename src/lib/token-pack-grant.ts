import "server-only";

import { userRepo } from "./users";
import { TOKEN_PACK } from "./schemas";

// ⚠ 2026-10-23 セキュリティ監査: 以前は "use server" の token-pack-actions.ts から export しており、
//   認証なしで呼べる Server Action として登録されていた（呼ばれれば誰にでもトークンを付与できる）。
//   Webhook からだけ呼ぶ内部関数なので、Server Action にならないこのファイルへ移した。

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

