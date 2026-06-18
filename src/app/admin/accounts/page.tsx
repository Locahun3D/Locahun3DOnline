import { userRepo } from "@/lib/users";
import {
  ACCOUNT_ROLES,
  ROLE_LABEL,
  ACCOUNT_STATUS_LABEL,
  type AccountStatus,
} from "@/lib/account-schema";
import {
  approveAccountAction,
  setAccountStatusAction,
  setAccountRoleAction,
  setTokenBalanceAction,
  deleteAccountAction,
} from "@/lib/admin-actions";

export const metadata = { title: "アカウント" };

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: "text-green-400 border-green-400/40",
  pending: "text-amber-400 border-amber-400/40",
  suspended: "text-red-400 border-red-400/40",
};

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const all = await userRepo.list();
  const users =
    status && ["active", "pending", "suspended"].includes(status)
      ? all.filter((u) => u.status === status)
      : all;

  const pendingCount = all.filter((u) => u.status === "pending").length;

  return (
    <div className="p-6 md:p-10">
      <div className="chapter-rule">
        <span className="opacity-60">ADMIN</span>
        <span>アカウント管理</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60">{users.length} 件</span>
      </div>

      <div className="flex items-center gap-3 mb-6 text-[11px] mono uppercase tracking-[0.2em]">
        <a href="/admin/accounts" className={!status ? "text-accent" : "text-muted hover:text-ink"}>
          すべて
        </a>
        <a href="/admin/accounts?status=pending" className={status === "pending" ? "text-accent" : "text-muted hover:text-ink"}>
          承認待ち{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </a>
        <a href="/admin/accounts?status=active" className={status === "active" ? "text-accent" : "text-muted hover:text-ink"}>
          有効
        </a>
        <a href="/admin/accounts?status=suspended" className={status === "suspended" ? "text-accent" : "text-muted hover:text-ink"}>
          停止中
        </a>
      </div>

      {users.length === 0 ? (
        <p className="text-[13px] text-muted">該当するアカウントはありません。</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="border border-line p-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] text-ink">{u.name}</span>
                  <span className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-1.5 py-0.5 text-muted">
                    {ROLE_LABEL[u.role]}
                  </span>
                  <span
                    className={`mono text-[10px] tracking-[0.2em] uppercase border px-1.5 py-0.5 ${STATUS_STYLE[u.status]}`}
                  >
                    {ACCOUNT_STATUS_LABEL[u.status]}
                  </span>
                  {u.role === "production" && (
                    <span className="mono text-[10px] text-muted">
                      NDA: {u.ndaAcceptedAt ? "✓ 締結済" : "未締結"}
                    </span>
                  )}
                </div>
                <div className="mono text-[11px] text-muted mt-1 truncate">
                  {u.email}
                  {u.company ? ` · ${u.company}` : ""}
                  {u.phone ? ` · ${u.phone}` : ""}
                </div>
                <div className="mono text-[10px] text-muted mt-0.5">
                  プラン {u.plan.toUpperCase()} · トークン {u.tokenBalance} · 登録{" "}
                  {(u.createdAt ?? "").slice(0, 10)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {u.status === "pending" && (
                  <form action={approveAccountAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/50 text-green-400 px-3 py-1.5 hover:bg-green-400 hover:text-bg transition">
                      承認
                    </button>
                  </form>
                )}

                <form action={setAccountStatusAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <select
                    name="status"
                    defaultValue={u.status}
                    className="bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
                  >
                    <option value="active">有効</option>
                    <option value="pending">承認待ち</option>
                    <option value="suspended">停止</option>
                  </select>
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">
                    状態
                  </button>
                </form>

                <form action={setAccountRoleAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <select
                    name="role"
                    defaultValue={u.role}
                    className="bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
                  >
                    {ACCOUNT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">
                    役割
                  </button>
                </form>

                <form action={setTokenBalanceAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <input
                    type="number"
                    name="balance"
                    defaultValue={u.tokenBalance}
                    min={0}
                    className="w-16 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
                  />
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">
                    付与
                  </button>
                </form>

                <form action={deleteAccountAction}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="mono text-[10px] uppercase border border-red-400/40 text-red-400/80 px-2 py-1.5 hover:bg-red-400 hover:text-bg transition">
                    削除
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
