"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type PropertyCategory,
  type PropertyStatus,
} from "@/lib/schemas";
import PropertyRowActions from "@/components/admin/property-row-actions";
import { bulkSetStatusAction, bulkDeleteAction } from "@/app/admin/_actions";

export type PropertyListItem = {
  id: string;
  title: string;
  city: string;
  category: PropertyCategory;
  status: PropertyStatus;
  updatedAt?: string;
  publishRequestedAt?: string | null;
};

const GRID = "grid-cols-[34px_72px_1fr_96px_96px_140px_minmax(290px,320px)]";

const STATUS_TABS: { key: PropertyStatus | "all"; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "published", label: "公開" },
  { key: "draft", label: "下書き" },
  { key: "archived", label: "アーカイブ" },
];

export default function PropertiesAdmin({ items }: { items: PropertyListItem[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.id} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, statusFilter]);

  const counts = useMemo(
    () => ({
      published: items.filter((p) => p.status === "published").length,
      draft: items.filter((p) => p.status === "draft").length,
      archived: items.filter((p) => p.status === "archived").length,
    }),
    [items],
  );

  const visibleIds = filtered.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...visibleIds]);
    });

  const runBulk = (fn: () => Promise<unknown>, label: string) =>
    startTransition(async () => {
      setNotice(null);
      try {
        const res = (await fn()) as
          | { count?: number; total?: number; skipped?: string[] }
          | undefined;
        setSelected(new Set());
        // サーバーアクションの revalidatePath だけに頼らず明示的に再取得する。
        // これが無いと環境によっては一覧(items props)が古いまま＝「ステータスが
        // 変わらない(効かない)」ように見える（今回の不具合の主因）。
        router.refresh();
        // 結果は必ず表示する（skip=0でも）。「反応がない＝バグ」の誤解を防ぎ、
        // 公開要件不足でスキップされた場合の理由も明示する。
        if (
          res &&
          typeof res.total === "number" &&
          typeof res.count === "number"
        ) {
          const skip = res.total - res.count;
          setNotice(
            skip > 0
              ? `${label}: ${res.count}/${res.total} 件を処理（${skip} 件は公開要件を満たさずスキップ）`
              : `${label}: ${res.count} 件を処理しました`,
          );
        } else if (res && typeof res.count === "number") {
          setNotice(`${label}: ${res.count} 件を処理しました`);
        } else {
          setNotice(`${label}を実行しました`);
        }
      } catch (e) {
        console.error(e);
        setNotice(
          `${label}に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

  const ids = [...selected];
  const tabCount = (k: PropertyStatus | "all") =>
    k === "all" ? items.length : counts[k];

  return (
    <div className="space-y-4">
      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・ID・都市で検索…"
          className="bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] w-full sm:w-72 focus:outline-none focus:border-accent placeholder:text-black/40"
        />
        <div className="flex flex-wrap gap-2 mono text-[10px] tracking-[0.22em] uppercase">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 border transition ${
                statusFilter === t.key
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {t.label} {tabCount(t.key)}
            </button>
          ))}
        </div>
        <span className="mono text-[11px] text-muted ml-auto">
          {filtered.length} 件表示
        </span>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 border border-line bg-ink/[0.04] px-3 py-2 text-[12px] text-ink/80">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="mono text-[10px] text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-accent/40 bg-accent/10 px-3 py-2">
          <span className="mono text-[11px] text-accent">
            {selected.size} 件選択中
          </span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            <BulkBtn label="公開" disabled={pending} onClick={() => runBulk(() => bulkSetStatusAction(ids, "published"), "公開")} />
            <BulkBtn label="非公開" disabled={pending} onClick={() => runBulk(() => bulkSetStatusAction(ids, "draft"), "非公開")} />
            <BulkBtn label="アーカイブ" disabled={pending} onClick={() => runBulk(() => bulkSetStatusAction(ids, "archived"), "アーカイブ")} />
            <BulkBtn
              label="削除"
              danger
              disabled={pending}
              onClick={() => {
                if (confirm(`${selected.size} 件を削除しますか？この操作は元に戻せません。`)) {
                  runBulk(() => bulkDeleteAction(ids), "削除");
                }
              }}
            />
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="mono text-[10px] tracking-[0.18em] uppercase px-2 py-1.5 text-muted hover:text-ink transition"
            >
              選択解除
            </button>
          </div>
        </div>
      )}

      <div className="border border-line overflow-x-auto">
        <div className={`grid ${GRID} gap-3 px-4 py-3 border-b border-line bg-[#222] mono text-[10px] tracking-[0.28em] uppercase opacity-60 min-w-[860px]`}>
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              aria-label="表示中をすべて選択"
              className="w-4 h-4 accent-[#5ec8e8]"
            />
          </div>
          <div>Status</div>
          <div>Title</div>
          <div>Category</div>
          <div>City</div>
          <div>Updated</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">
            該当する物件がありません。
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`grid ${GRID} gap-3 px-4 py-3 border-b border-line items-center transition min-w-[860px] ${
                selected.has(p.id) ? "bg-accent/10" : "hover:bg-neutral-100"
              }`}
            >
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`${p.title} を選択`}
                  className="w-4 h-4 accent-[#5ec8e8]"
                />
              </div>
              <div className="flex flex-col items-start gap-1">
                <StatusBadge status={p.status} />
                {p.publishRequestedAt && p.status !== "published" && (
                  <span className="mono text-[9px] tracking-[0.2em] uppercase border border-accent text-accent px-1.5 py-0.5">
                    申請中
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <Link
                  href={`/admin/properties/${p.id}/edit`}
                  className="block truncate hover:text-accent transition"
                >
                  {p.title || "（無題）"}
                </Link>
                <div className="mono text-[10px] opacity-50 mt-0.5">{p.id}</div>
              </div>
              <div className="text-[12px] text-muted">
                {CATEGORY_LABEL[p.category]}
              </div>
              <div className="text-[12px] text-muted truncate">{p.city || "—"}</div>
              <div className="mono text-[11px] text-muted">
                {p.updatedAt ? p.updatedAt.slice(0, 16).replace("T", " ") : "—"}
              </div>
              <PropertyRowActions id={p.id} status={p.status} />
            </div>
          ))
        )}
      </div>
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

function StatusBadge({ status }: { status: PropertyStatus }) {
  const styles =
    status === "published"
      ? "bg-accent text-bg"
      : status === "draft"
        ? "bg-[#222] text-ink"
        : "bg-[#111] text-muted";
  return (
    <span
      className={`inline-block px-2 py-1 mono text-[9px] tracking-[0.22em] uppercase text-center ${styles}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
