"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { fmtDateOnlyJST } from "@/lib/date-format";
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
  rejectAccountAction,
  setAccountStatusAction,
  setAccountRoleAction,
  setTokenBalanceAction,
  deleteAccountAction,
  bulkSetAccountStatusAction,
  bulkGrantFreeTokensAction,
  bulkGrantTokensAction,
  linkPropertiesToUserAction,
} from "@/lib/admin-actions";
import { isFreeEmailDomain } from "@/lib/free-email-domains";
import { REJECT_REASONS, REJECT_REASON_LABEL, type RejectReason } from "@/lib/account-reject-reasons";

const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [freeGrantAmount, setFreeGrantAmount] = useState(9);
  const [selectedGrantAmount, setSelectedGrantAmount] = useState(6);

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
  const freeCount = users.filter((u) => u.plan === "free").length;

  // 50件/ページ。フィルタ変更で件数が減った場合も範囲外にならないようクランプ
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageUsers = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  // 「表示中をすべて選択」は現在ページの表示分のみ対象
  const visibleIds = pageUsers.map((u) => u.id);
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
  const runBulk = (fn: () => Promise<unknown>, label: string) =>
    startTransition(async () => {
      setNotice(null);
      try {
        const res = (await fn()) as
          | { ok?: boolean; count?: number; total?: number; grant?: number }
          | undefined;
        setSelected(new Set());
        if (res && res.ok === false) {
          setNotice(`${label}に失敗しました`);
        } else if (
          res &&
          typeof res.total === "number" &&
          typeof res.count === "number" &&
          res.count < res.total
        ) {
          const skip = res.total - res.count;
          setNotice(
            `${label}: ${res.count}/${res.total} 件を処理（${skip} 件はスキップ）`,
          );
        } else if (res && typeof res.count === "number" && typeof res.grant === "number") {
          setNotice(`${label}: ${res.count} 件に ${res.grant} トークンずつ付与しました`);
        } else if (res && typeof res.count === "number") {
          setNotice(`${label}: ${res.count} 件を処理しました`);
        }
      } catch (e) {
        console.error(e);
        setNotice(
          `${label}に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

  const ids = [...selected];

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="名前・メール・所属で検索…"
          className="bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-72 focus:outline-none focus:border-accent placeholder:text-black/40"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as AccountRole | "all");
            setPage(1);
          }}
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
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
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
        <span className="mono text-[11px] text-muted ml-auto">
          {filtered.length === 0
            ? "0 件"
            : `${pageStart + 1}〜${pageStart + pageUsers.length} / 全${filtered.length}件`}
        </span>
      </div>

      {/* フリープラン全員へのトークン一括付与（選択とは無関係・対象は plan==="free" 全員）。
          登録ボーナスを1→6に修正した際、修正前に登録済みのフリーユーザーは
          古い残高のまま取り残されていたため、その差分を埋める救済用に追加。
          付与数はここで変更可（既存残高への加算・上書きではない）。 */}
      <div className="flex flex-wrap items-center gap-3 border border-line bg-ink/[0.03] px-3 py-2">
        <span className="text-[12px] text-ink/70">
          フリープラン {freeCount} 件に、トークンを一括付与（既存残高に加算）
        </span>
        <input
          type="number"
          min={1}
          value={freeGrantAmount}
          onChange={(e) => setFreeGrantAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
          className="w-16 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
        />
        <BulkBtn
          label={`フリープラン全員に +${freeGrantAmount} トークン`}
          disabled={pending || freeCount === 0}
          onClick={() => {
            if (confirm(`フリープランの ${freeCount} 件に ${freeGrantAmount} トークンずつ付与します（既存残高に加算）。よろしいですか？`)) {
              runBulk(() => bulkGrantFreeTokensAction(freeGrantAmount), "トークン付与");
            }
          }}
        />
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 border border-line bg-ink/[0.04] px-3 py-2 text-[12px] text-ink/80">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="mono text-[10px] text-muted hover:text-ink">✕</button>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-2">
          <span className="mono text-[11px] text-accent">{selected.size} 件選択中</span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <BulkBtn label="承認/有効化" disabled={pending} onClick={() => runBulk(() => bulkSetAccountStatusAction(ids, "active"), "承認/有効化")} />
            <BulkBtn label="停止" disabled={pending} onClick={() => runBulk(() => bulkSetAccountStatusAction(ids, "suspended"), "停止")} />
            {/* 選択アカウント(プラン不問)への任意数トークン加算付与。既存残高への
                加算であり上書きではない（1件だけ選べば特定アカウントへの加算にも使える）。 */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={selectedGrantAmount}
                onChange={(e) => setSelectedGrantAmount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
                className="w-14 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink"
              />
              <BulkBtn
                label={`+${selectedGrantAmount} トークン付与`}
                disabled={pending}
                onClick={() => {
                  if (confirm(`選択した ${selected.size} 件に ${selectedGrantAmount} トークンずつ付与します（既存残高に加算）。よろしいですか？`)) {
                    runBulk(() => bulkGrantTokensAction(ids, selectedGrantAmount), "トークン付与");
                  }
                }}
              />
            </div>
            {/* ⚠ 一括削除は置かない。取り消しが効かず、チェックの付け間違いが
                そのまま複数アカウントの消失になるため（2026-07-29 ユーザー判断）。
                削除は各行の「削除」ボタンから1件ずつ行う。 */}
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

          {pageUsers.map((u) => (
            <div
              key={u.id}
              className={`border p-4 grid gap-3 md:grid-cols-[20px_1fr_auto] md:items-center ${
                selected.has(u.id) ? "border-accent/50 bg-accent/10" : "border-line"
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
                  {u.role === "production" && isFreeEmailDomain(u.email) && (
                    <span
                      className="mono text-[9px] text-amber-400 border border-amber-400/40 px-1"
                      title="会社メール必須ルールの追加前に登録された、または手動でproductionへ変更された個人メールアカウントです。"
                    >
                      ⚠ 個人メール
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
                    ? `（失効 ${fmtDateOnlyJST(u.tokenExpiresAt)}）`
                    : ""}{" "}
                  · 登録 {u.createdAt ? fmtDateOnlyJST(u.createdAt) : ""}
                  {u.role === "studio" && (u.linkedPropertyIds ?? []).length > 0 && (
                    <> · 紐付物件 {(u.linkedPropertyIds ?? []).length}件</>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {u.status === "pending" && (
                  <>
                    <form action={approveAccountAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/50 text-green-400 px-3 py-1.5 hover:bg-green-400 hover:text-bg transition">
                        承認
                      </button>
                    </form>
                    {/* 却下は必ず理由を選ばせる。申請者への通知本文がこの選択で変わり、
                        「何を直せば通るのか」が伝わる（文面は lib/account-reject-reasons.ts）。
                        既定は会社メール以外での申請＝実際に最も多い却下理由。 */}
                    <form
                      action={rejectAccountAction}
                      className="flex items-center gap-1"
                      onSubmit={(e) => {
                        const reason = new FormData(e.currentTarget).get("reason");
                        const label = REJECT_REASON_LABEL[reason as RejectReason] ?? "";
                        if (!confirm(
                          `${u.name} さんの制作会社アカウント申請を「${label}」で却下しますか？\n` +
                          `個人アカウントに戻り、理由を説明する通知が本人に届きます。`,
                        )) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="id" value={u.id} />
                      <select name="reason" defaultValue="personal_email" className="bg-bg border border-line text-[11px] px-2 py-1.5 text-ink">
                        {REJECT_REASONS.map((r) => (
                          <option key={r} value={r}>{REJECT_REASON_LABEL[r]}</option>
                        ))}
                      </select>
                      <button className="mono text-[10px] tracking-[0.18em] uppercase border border-red-400/50 text-red-400 px-3 py-1.5 hover:bg-red-400 hover:text-bg transition">
                        却下
                      </button>
                    </form>
                  </>
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

                {/* これは加算(付与)ではなく残高そのものを置き換える「上書き」。
                    加算したい場合は下の選択チェック→一括バーの「+N トークン付与」を使う
                    （1件だけ選べば特定アカウントへの加算にもなる）。 */}
                <form
                  action={setTokenBalanceAction}
                  className="flex items-center gap-1"
                  title="現在の残高を、ここで指定した数値に置き換えます（加算ではありません）"
                >
                  <input type="hidden" name="id" value={u.id} />
                  <input type="number" name="balance" defaultValue={u.tokenBalance} min={0} className="w-16 bg-bg border border-line text-[11px] px-2 py-1.5 text-ink" />
                  <button className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition">残高を上書き</button>
                </form>

                <Link
                  href={`/admin/accounts/${u.id}/tokens`}
                  className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition"
                >
                  履歴
                </Link>

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

                <Link
                  href={`/admin/accounts/${u.id}/sessions`}
                  className="mono text-[10px] uppercase border border-line px-2 py-1.5 text-muted hover:text-accent hover:border-accent transition"
                >
                  端末
                </Link>

                {u.id !== adminId && (
                  <form action={deleteAccountAction}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="mono text-[10px] uppercase border border-red-400/40 text-red-400/80 px-2 py-1.5 hover:bg-red-400 hover:text-bg transition">削除</button>
                  </form>
                )}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <Pager
              page={safePage}
              totalPages={totalPages}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0 });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Pager({
  page, totalPages, onChange,
}: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) {
  // 現在ページ±2＋先頭末尾のみ表示（805件=17ページでも収まる窓方式）
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) {
      nums.push(p);
    } else if (nums[nums.length - 1] !== "…") {
      nums.push("…");
    }
  }
  const btn =
    "mono text-[11px] px-2.5 py-1.5 border transition disabled:opacity-40 disabled:pointer-events-none";
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 pt-2" aria-label="ページ送り">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${btn} border-line text-muted hover:border-ink hover:text-ink`}
      >
        前へ
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`gap-${i}`} className="mono text-[11px] text-muted px-1">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? "page" : undefined}
            className={`${btn} ${
              n === page
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className={`${btn} border-line text-muted hover:border-ink hover:text-ink`}
      >
        次へ
      </button>
    </nav>
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
