import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/account-schema";
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
    <div className="ui-page-shell px-6 pb-6 md:px-10 md:pb-10">
      <div className="ui-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="ui-page-title">アカウント管理</h1>
        <span className="opacity-60">{users.length} 件</span>
      </div>

      <AccountsAdmin
        key={initialStatus}
        users={users}
        adminId={admin.id}
        initialStatus={initialStatus}
        archived={archived}
      />
    </div>
  );
}
