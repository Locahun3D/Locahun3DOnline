"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CATEGORY_LABEL,
  type PropertyCategory,
  type PropertyStatus,
} from "@/lib/schemas";
import PropertyRowActions from "@/components/admin/property-row-actions";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";
import { bulkSetStatusAction, bulkDeleteAction } from "@/app/admin/_actions";
import styles from "./properties-admin.module.css";
import {
  publishStage,
  PUBLISH_DISPLAY_LABEL,
  publishDisplayStage,
  REVIEW_SUBSTATE_LABEL,
  type PublishDisplayStage,
  type PublishStage,
  type ReviewSubState,
} from "@/lib/publish-flow";

export type PropertyListItem = {
  id: string;
  title: string;
  city: string;
  category: PropertyCategory;
  status: PropertyStatus;
  updatedAt?: string;
  publishRequestedAt?: string | null;
  /** 公開申請中の細かい状態（確認メール未送信 / スタジオ確認待ち / 確認済み）。 */
  reviewState?: ReviewSubState;
  /** 公開に必要な項目がすべて埋まっているか（下書きを「公開申請待ち」と出し分けるため）。 */
  ready?: boolean;
  /** 一覧のサムネイル用（カバー写真のURLだけ渡す） */
  coverSrc?: string;
};

// ステータス列は 72px だとバッジ（大きくした）が収まらないので 104px に広げる。
const GRID = "grid-cols-[34px_104px_1fr_96px_96px_140px_minmax(290px,320px)]";

// タブは公開ワークフローの段階で切る（2026-09-20）: 下書き → 公開申請中 → 公開。
// 「公開申請中」は status=draft + publishRequestedAt（lib/publish-flow.ts の publishStage）。
// 下書きタブには申請中を含めない（次に手を動かす対象が混ざらないように）。
const STATUS_TABS: { key: PublishStage | "all"; label: string }[] = [
  { key: "all", label: "全て" },
  { key: "draft", label: "下書き" },
  { key: "review", label: "公開申請済み" },
  { key: "published", label: "公開" },
  { key: "archived", label: "アーカイブ" },
];

const stageOf = (p: PropertyListItem): PublishStage =>
  publishStage({ status: p.status, publishRequestedAt: p.publishRequestedAt ?? null });

const displayStageOf = (p: PropertyListItem): PublishDisplayStage =>
  publishDisplayStage({ status: p.status, publishRequestedAt: p.publishRequestedAt ?? null }, !!p.ready);

export default function PropertiesAdmin({
  items,
  isAdmin = false,
}: {
  items: PropertyListItem[];
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PublishStage | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (statusFilter !== "all" && stageOf(p) !== statusFilter) return false;
      if (q) {
        const hay = `${p.title} ${p.id} ${p.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, statusFilter]);

  const counts = useMemo(
    () => ({
      published: items.filter((p) => stageOf(p) === "published").length,
      draft: items.filter((p) => stageOf(p) === "draft").length,
      review: items.filter((p) => stageOf(p) === "review").length,
      archived: items.filter((p) => stageOf(p) === "archived").length,
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
  const tabCount = (k: PublishStage | "all") =>
    k === "all" ? items.length : counts[k];

  return (
    <div className={`${styles.root} space-y-4`}>
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
      {/* 一括公開/削除は requireAdmin のサーバーアクションで、studio が押すと
          redirect("/") でページごと追い出されるため、見せない。 */}
      {isAdmin && selected.size > 0 && (
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

      <div className={`${styles.list} border border-line`}>
        <div className={`${styles.header} grid ${GRID} gap-3 px-4 py-3 border-b border-line bg-[#222] mono text-[10px] tracking-[0.28em] uppercase opacity-60`}>
          <div className="flex items-center">
            {/* 全選択チェックボックスは一括操作(admin専用)のためのUI。studioには出さない。 */}
            {isAdmin && (
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                aria-label="表示中をすべて選択"
                className="w-4 h-4 accent-[#5ec8e8]"
              />
            )}
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
              className={`${styles.row} grid ${GRID} gap-3 px-4 py-3 border-b border-line items-center transition ${
                selected.has(p.id) ? "bg-accent/10" : "hover:bg-neutral-100"
              }`}
            >
              <div className="flex items-center">
                {/* 行選択チェックボックスも一括操作(admin専用)のためのUI。studioには出さない。 */}
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`${p.title} を選択`}
                    className="w-4 h-4 accent-[#5ec8e8]"
                  />
                )}
              </div>
              <div className="flex flex-col items-start gap-1">
                <StageBadge stage={displayStageOf(p)} />
                {stageOf(p) === "review" && (
                  <span className="text-[10px] leading-tight text-muted">
                    {REVIEW_SUBSTATE_LABEL[p.reviewState ?? "mail-unsent"]}
                  </span>
                )}
              </div>
              {/* サムネイル（2026-09-20 本人指示「物件一覧でサムネ見えるように」）。グリッドの列は増やさず、
                  タイトルのセルの中に置く（module.css の nth-child 指定を崩さないため）。 */}
              <div className="min-w-0 flex items-center gap-3">
                <Link href={`/admin/properties/${p.id}/edit`} tabIndex={-1} aria-hidden="true" className="flex-none !min-h-0">
                  {p.coverSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Workers 構成では next/image の最適化が 404 になる（CLAUDE.md）
                    <img src={p.coverSrc} alt="" loading="lazy" decoding="async" className="w-[84px] h-[56px] object-cover bg-[#ddd] border border-line" />
                  ) : (
                    <span className="w-[84px] h-[56px] flex items-center justify-center bg-neutral-200 border border-line mono text-[9px] tracking-[0.12em] text-muted">NO IMAGE</span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/properties/${p.id}/edit`}
                    className="block truncate hover:text-accent transition"
                  >
                    {p.title || "（無題）"}
                  </Link>
                  <div className="mono text-[10px] opacity-50 mt-0.5">{p.id}</div>
                </div>
              </div>
              <div className="text-[12px] text-muted">
                {CATEGORY_LABEL[p.category]}
              </div>
              <div className="text-[12px] text-muted truncate">{p.city || "—"}</div>
              <div className="mono text-[11px] text-muted">
                {/* 生ISOのsliceはUTC表示（実害あり）。JSTで整形 */}
                {p.updatedAt ? fmtDateTimeLocaleJST(p.updatedAt) : "—"}
              </div>
              <PropertyRowActions id={p.id} status={p.status} isAdmin={isAdmin} />
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

/**
 * 一覧の「下書き / 公開中」表示。9px の極小バッジで埋もれて読めない、という
 * 運用側の指摘（2026-08-13）を受けて、文字を大きく・色で区別し・●で状態が
 * 一目で分かる形にした。
 */
// 2026-09-21 本人指示: 下書き → 公開申請待ち（必要な項目が埋まった）→ 公開申請済み → 公開中。
const STAGE_BADGE: Record<PublishDisplayStage, { mark: string; className: string }> = {
  draft: { mark: "◐", className: "bg-amber-100 text-amber-900 border-amber-400" },
  ready: { mark: "◕", className: "bg-[#e7f3ff] text-[#0b4a7a] border-[#5ec8e8]" },
  review: { mark: "◑", className: "bg-[#fff1dc] text-[#7a4a00] border-[#ffb454]" },
  published: { mark: "●", className: "bg-[#0f7a4a] text-white border-[#0f7a4a]" },
  archived: { mark: "○", className: "bg-neutral-200 text-neutral-600 border-neutral-400" },
};

function StageBadge({ stage }: { stage: PublishDisplayStage }) {
  const { mark, className } = STAGE_BADGE[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[12px] font-bold leading-none whitespace-nowrap ${className}`}
    >
      <span aria-hidden="true">{mark}</span>
      {PUBLISH_DISPLAY_LABEL[stage]}
    </span>
  );
}
