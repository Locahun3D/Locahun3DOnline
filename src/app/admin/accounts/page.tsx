import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/account-schema";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
import AccountsAdmin from "@/components/admin/accounts-admin";
import { deletedAccountRepo } from "@/lib/deleted-accounts";

export const metadata = { title: "アカウント" };

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await requireAdmin();
  const [users, deleted] = await Promise.all([
    userRepo.list(),
    deletedAccountRepo.list(),
  ]);
  // アーカイブは表示に必要な分だけクライアントへ渡す（スナップショット全体は
  // 個人情報の塊なので、一覧のためだけにクライアントへ送らない）。
  const archived = deleted.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    reason: a.reason,
    deletedAt: a.deletedAt,
    deletedByEmail: a.deletedByEmail,
    role: a.snapshot?.role ?? "",
    plan: a.snapshot?.plan ?? "",
  }));

  const sp = await searchParams;
  const initialStatus: AccountStatus | "all" =
    sp.status && (ACCOUNT_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as AccountStatus)
      : "all";

  return (
    <AdminPageShell>
      {/* 2026-09-20: 管理画面共通の小型ヘッダー */}
      <AdminPageHeader title="アカウント" count={`${users.length} 件`} />

      <AccountsAdmin
        key={initialStatus}
        users={users}
        adminId={admin.id}
        initialStatus={initialStatus}
        archived={archived}
      />
    </AdminPageShell>
  );
}
