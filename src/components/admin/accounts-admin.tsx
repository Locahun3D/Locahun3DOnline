"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ACCOUNT_ROLES,
  ROLE_LABEL,
  ACCOUNT_STATUS_LABEL,
  totalTokens,
  type AccountRole,
  type AccountStatus,
  type User,
} from "@/lib/account-schema";
import {
  approveAccountAction,
  setAccountStatusAction,
  setAccountRoleAction,
  setTokenBalanceAction,
  deleteAccountAction,
  bulkSetAccountStatusAction,
  bulkDeleteAccountsAction,
  linkPropertiesToUserAction,
} from "@/lib/admin-actions";

const STATUS_STYLE: Record<AccountStatus, string> = {
  active: "text-green-400 border-green-400/40",
  pending: "text-amber-400 border-amber-400/40",
  suspended: "text-red-400 border-red-400/40",
};

export default function AccountsAdmin({
  users,
  adminId,
  initialStatus = "all",
}: {
  users: User[];
  adminId: string;
  initialStatus?: AccountStatus | "all";
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AccountRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">(initialStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (q) {
        const hay = `${u.name} ${u.email} ${u.company}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, query, roleFilter, statusFilter]);

  const pendingCount = users.filter((u) => u.status === "pending").length;
  const visibleIds = filtered.map((u) => u.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((p) => {
      if (allVisibleSelected) {
        const n = new Set(p);
        visibleIds.forEach((id) => n.delete(id));
        return n;
      }
      return new Set([...p, ...visibleIds]);
    });
  const runBulk = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setSelected(new Set());
    });

  const ids = [...selected];

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・メール・所属で検索…"
          className="bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-72 focus:outline-none focus:border-accent placeholder:text-black/40"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as AccountRole | "all")}
          className="bg-bg border border-line text-[12px] px-2 py-2 text-ink"
        >
          <option value="all">役割すべて</option>
          {ACCOUNT_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2 mono text-[10px] tracking-[0.22em] uppercase">
          {(["all", "pending", "active", "suspended"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 border transition ${
                statusFilter === s
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {s === "all" ? "すべて" : ACCOUNT_STATUS_LABEL[s]}
              {s === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
        <span className="mono text-[11px] text-muted ml-auto">{filtered.length} 件</span>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-2">
          <span className="mono text-[11px] text-accent">{selected.size} 件選択中</span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <BulkBtn label="承認/有効化" disabled={pending} onClick={() => runBulk(() => bulkSetAccountStatusAction(ids, "active"))} />
            <BulkBtn label="停止" disabled={pending} onClick={() => runBulk(() => bulkSetAccountStatusAction(ids, "suspended"))} />
            <BulkBtn
              label="削除"
              danger
              disabled={pending}
              onClick={() => {
                if (confirm(`${selected.size} 件を削除しますか？（自分自身は除外されます）`)) {
                  runBulk(() => bulkDeleteAccountsAction(ids));
                }
              }}
            />
            <button type="button" onClick={() => setSelected(new Set())} className="mono text-[10px] tracking-[0.18em] uppercase px-2 py-1.5 text-muted hover:text-ink">
              選択解除
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[13px] text-muted">該当するアカウントはありません。</p>
      ) : (
        <div className="space-y-3">
          {/* select-all row */}
          <label className="flex items-center gap-2 text-[11px] text-muted mono uppercase tracking-[0.18em] px-1">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              className="w-4 h-4 accent-[#5ec8e8]"
            />
            表示中をすべて選択
          </label>

          {filtered.map((u) => (
            <div
              key={u.id}
              className={`border p-4 grid gap-3 md:grid-cols-[20px_1fr_auto] md:items-center ${
                selected.has(u.id) ? "border-accent/50 bg-[#0e1a20]" : "border-line"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                aria-label={`${u.name} を選択`}
                className="w-4 h-4 accent-[#5ec8e8] mt-1 md:mt-0"
              />

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] text-ink">{u.name}</span>
                  {u.id === adminId && (
                    <span className="mono text-[9px] text-accent border border-accent/40 px-1">あなた</span>
                  )}
                  <span className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-1.5 py-0.5 text-muted">
                    {ROLE_LABEL[u.role]}
                  </span>
                  <span className={`mono text-[10px] tracking-[0.2em] uppercase border px-1.5 py-0.5 ${STATUS_STYLE[u.status]}`}>
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
                  プラン {u.plan.toUpperCase()} · トークン {totalTokens(u)}
                  {u.tokenExpiresAt && u.tokenBalance > 0
                    ? `（失効 ${u.tokenExpiresAt.slice(0, 10)}）`
                    : ""}{" "}
                  · 登録 {(u.createdAt ?? "").slice(0, 10)}
                  {u.role === "studio" && (u.linkedPropertyIds ?? []).length > 0 && (
                    <> · 紐付物件 {(u.linkedPropertyIds ?? []).length}件</>
                  )}
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
                  <select name="status" defaultValue={u.status} className="bg-bg border border-line text-[11px] px-2 py-1.5 text-ink">
                    <option value="active">有効</option>
                    <option value="pending">承認待ち</option>
                    <option value="suspended">停止</option>
                  </select>
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">状態</button>
                </form>

                <form action={setAccountRoleAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="bg-bg border border-line text-[11px] px-2 py-1.5 text-ink">
                    {ACCOUNT_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">役割</button>
                </form>

                <form action={setTokenBalanceAction} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="number" name="balance" defaultValue={u.tokenBalance} min={0} className="w-16 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink" />
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">付与</button>
                </form>

                {u.role === "studio" && (
                  <form action={linkPropertiesToUserAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input
                      type="text"
                      name="propertyIds"
                      defaultValue={(u.linkedPropertyIds ?? []).join(",")}
                      placeholder="物件ID（カンマ区切り）"
                      className="w-40 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
                    />
                    <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">紐付</button>
                  </form>
                )}

                {u.id !== adminId && (
                  <form action={deleteAccountAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="mono text-[10px] uppercase border border-red-400/40 text-red-400/80 px-2 py-1.5 hover:bg-red-400 hover:text-bg transition">削除</button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkBtn({
  label, onClick, danger, disabled,
}: {
  label: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mono text-[10px] tracking-[0.18em] uppercase border px-2.5 py-1.5 transition disabled:opacity-50 ${
        danger
          ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
          : "border-line text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {label}
    </button>
  );
}
