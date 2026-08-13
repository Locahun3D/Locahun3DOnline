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
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アカウント管理</span>
        <span className="flex-1 h-px bg-current opacity-25" />
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
