import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { repo as propertyRepo } from "@/lib/store";
import { totalTokens } from "@/lib/account-schema";
import { fmtDateOnlyJST } from "@/lib/date-format";

export const metadata = { title: "トークン使用履歴" };

/**
 * 管理者向け: 特定アカウントのトークン使用履歴（/dashboard/unlocked の管理版）。
 * 「登録時6付与のはずが残高が少ない」といった問い合わせに対し、実際に何回・
 * どのシーンでトークンが消費されたかを admin が直接確認できるようにする。
 */
export default async function AdminAccountTokensPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const user = await userRepo.get(id);
  if (!user) notFound();

  const unlocks = await viewUnlockRepo.list({ userId: id });
  // 新しい順（消費履歴は直近が知りたいことが多い）。
  unlocks.sort((a, b) => (a.unlockedAt < b.unlockedAt ? 1 : -1));

  const propertyIds = [...new Set(unlocks.map((u) => u.propertyId))];
  const properties = await Promise.all(propertyIds.map((pid) => propertyRepo.get(pid)));
  const propertyMap = new Map(properties.filter(Boolean).map((p) => [p!.id, p!]));

  const totalSpent = unlocks.reduce((sum, u) => sum + (u.tokensSpent ?? 0), 0);
  const now = new Date().toISOString();

  const rows = unlocks.map((u) => {
    const property = propertyMap.get(u.propertyId) ?? null;
    const item = u.splatItemId
      ? property?.splatItems.find((it) => it.id === u.splatItemId)
      : property?.splatItems[u.splatItemIndex];
    return {
      unlock: u,
      propertyTitle: property?.title || u.propertyId,
      propertyExists: !!property,
      sceneLabel: item?.label || `#${u.splatItemIndex + 1}`,
      valid: u.expiresAt > now,
    };
  });

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>トークン使用履歴</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <Link href="/admin/accounts" className="mono text-[10px] tracking-[0.18em] uppercase opacity-60 hover:opacity-100">
          ← アカウント一覧
        </Link>
      </div>

      {/* サマリー */}
      <div className="border border-line p-5 mb-8 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">アカウント</div>
          <div className="text-[14px]">{user.name || user.email}</div>
          <div className="mono text-[11px] opacity-60">{user.email}</div>
        </div>
        <div>
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">プラン / 登録日</div>
          <div className="text-[14px]">{user.plan.toUpperCase()}</div>
          <div className="mono text-[11px] opacity-60">{user.createdAt ? fmtDateOnlyJST(user.createdAt) : ""}</div>
        </div>
        <div>
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">現在の残高</div>
          <div className="text-[14px]">
            {totalTokens(user)} トークン
            {user.bonusTokens > 0 && (
              <span className="mono text-[11px] opacity-60"> （内 貢献特別枠 {user.bonusTokens}）</span>
            )}
          </div>
          {user.tokenExpiresAt && user.tokenBalance > 0 && (
            <div className="mono text-[11px] opacity-60">失効 {fmtDateOnlyJST(user.tokenExpiresAt)}</div>
          )}
        </div>
        <div>
          <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">累計消費</div>
          <div className="text-[14px]">{totalSpent} トークン（{unlocks.length} 件の視聴解除）</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] opacity-60">このアカウントはまだトークンを消費していません（3DGSの視聴解除記録がありません）。</p>
      ) : (
        <div className="border border-line overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="bg-[#222] border-b border-line">
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">物件 / シーン</th>
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">消費トークン</th>
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">解除日</th>
                <th className="text-left px-4 py-3 mono text-[10px] tracking-[0.2em] uppercase opacity-60 font-normal">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ unlock, propertyTitle, propertyExists, sceneLabel, valid }, i) => (
                <tr key={unlock.id} className={`border-b border-line ${i % 2 === 1 ? "bg-[#1c1c1c]" : ""}`}>
                  <td className="px-4 py-3">
                    <div>{propertyTitle}</div>
                    <div className="mono text-[10px] tracking-[0.14em] uppercase opacity-50 mt-0.5">
                      {sceneLabel}
                      {!propertyExists && "（掲載終了）"}
                    </div>
                  </td>
                  <td className="px-4 py-3">{unlock.tokensSpent}</td>
                  <td className="px-4 py-3 opacity-70">{fmtDateOnlyJST(unlock.unlockedAt)}</td>
                  <td className="px-4 py-3">
                    {valid ? (
                      <span className="mono text-[10px] tracking-[0.14em] uppercase text-green-500">
                        {fmtDateOnlyJST(unlock.expiresAt)} まで無償再視聴
                      </span>
                    ) : (
                      <span className="mono text-[10px] tracking-[0.14em] uppercase opacity-50">期限切れ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
