import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import AccountsAdmin from "@/components/admin/accounts-admin";

export const metadata = { title: "アカウント" };

export default async function AdminAccountsPage() {
  const admin = await requireAdmin();
  const users = await userRepo.list();

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アカウント管理</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">{users.length} 件</span>
      </div>

      <AccountsAdmin users={users} adminId={admin.id} />
    </div>
  );
}
