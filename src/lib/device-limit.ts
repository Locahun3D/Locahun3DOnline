import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { AccountPlan } from "./account-schema";

/**
 * プランごとの同時ログイン端末数の上限。null = 上限なし(未計測)。
 * 料金ページの比較表・プランカードと必ず一致させること。
 */
export function deviceLimitForPlan(plan: AccountPlan): number | null {
  switch (plan) {
    case "individual":
      return 3;
    case "studio":
      return 10;
    case "team":
      return 30;
    default:
      return null; // free
  }
}

export interface ActiveDeviceSession {
  id: string;
  lastActiveAt: number;
  createdAt: number;
  isMobile?: boolean;
  browserName?: string;
  deviceType?: string;
  city?: string;
  country?: string;
}

/** 最終アクティブが新しい順。 */
export async function listActiveSessions(userId: string): Promise<ActiveDeviceSession[]> {
  const client = await clerkClient();
  const res = await client.sessions.getSessionList({ userId, status: "active" });
  return res.data
    .map((s) => ({
      id: s.id,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isMobile: s.latestActivity?.isMobile,
      browserName: s.latestActivity?.browserName,
      deviceType: s.latestActivity?.deviceType,
      city: s.latestActivity?.city,
      country: s.latestActivity?.country,
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

/**
 * プランの端末上限を超えている分だけ、最終アクティブが古いセッションから
 * 順に失効(revoke)させる。呼び出し中のセッション自身は「たった今アクティブ」
 * なので最新側に来るため、通常は失効対象にならない。
 *
 * Clerk Webhook (session.created) を使わないのは、Clerkダッシュボード側で
 * 追加のWebhook購読設定が必要になり、こちらのコードだけでは完結しないため。
 * 代わりに getCurrentUser() 経由でスロットル付き(device-limit-throttle.ts的な
 * 発想をここに内包)に呼び出し、新規端末サインインからおおよそ数分〜次回
 * アクセス時には収束する形にする。
 */
export async function enforceDeviceLimit(
  userId: string,
  plan: AccountPlan,
): Promise<{ revoked: number }> {
  const limit = deviceLimitForPlan(plan);
  if (limit === null) return { revoked: 0 };
  const sessions = await listActiveSessions(userId);
  if (sessions.length <= limit) return { revoked: 0 };

  const client = await clerkClient();
  const excess = sessions.slice(limit);
  const results = await Promise.allSettled(
    excess.map((s) => client.sessions.revokeSession(s.id)),
  );
  const revoked = results.filter((r) => r.status === "fulfilled").length;
  return { revoked };
}
