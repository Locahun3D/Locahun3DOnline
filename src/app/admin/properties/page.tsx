import Link from "next/link";
import { repo } from "@/lib/store";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  type PropertyStatus,
} from "@/lib/schemas";
import { createDraftAction } from "../_actions";

type SP = Record<string, string | string[] | undefined>;

function pickStatus(sp: SP): PropertyStatus | undefined {
  const v = sp.status;
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "draft" || s === "published" || s === "archived") return s;
  return undefined;
}

export default async function AdminPropertiesList({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const status = pickStatus(sp);
  const all = await repo.list();
  const filtered = status ? all.filter((p) => p.status === status) : all;

  const counts = {
    draft: all.filter((p) => p.status === "draft").length,
    published: all.filter((p) => p.status === "published").length,
    archived: all.filter((p) => p.status === "archived").length,
  };

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
            Properties
          </div>
          <h1 className="serif text-3xl">物件管理</h1>
          <div className="mt-2 mono text-[11px] text-muted">
            合計 {all.length} 件 ／ 公開 {counts.published} ／ 下書き{" "}
            {counts.draft} ／ アーカイブ {counts.archived}
          </div>
        </div>

        <form action={createDraftAction}>
          <button
            type="submit"
            className="px-5 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            ＋ 新規物件を作成
          </button>
        </form>
      </div>

      <div className="border border-line">
        <div className="grid grid-cols-[80px_1fr_120px_120px_160px_120px] gap-3 px-4 py-3 border-b border-line bg-[#222] mono text-[10px] tracking-[0.28em] uppercase opacity-60">
          <div>Status</div>
          <div>Title</div>
          <div>Category</div>
          <div>City</div>
          <div>Updated</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">
            物件はまだありません。「新規物件を作成」から始めてください。
          </div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[80px_1fr_120px_120px_160px_120px] gap-3 px-4 py-3 border-b border-line items-center hover:bg-[#222] transition"
            >
              <StatusBadge status={p.status} />
              <div className="min-w-0">
                <Link
                  href={`/admin/properties/${p.id}/edit`}
                  className="block truncate hover:text-accent transition"
                >
                  {p.title}
                </Link>
                <div className="mono text-[10px] opacity-50 mt-0.5">
                  {p.id}
                </div>
              </div>
              <div className="text-[12px] text-muted">
                {CATEGORY_LABEL[p.category]}
              </div>
              <div className="text-[12px] text-muted truncate">{p.city || "—"}</div>
              <div className="mono text-[11px] text-muted">
                {p.updatedAt ? p.updatedAt.slice(0, 16).replace("T", " ") : "—"}
              </div>
              <div className="text-right flex gap-2 justify-end">
                <Link
                  href={`/admin/properties/${p.id}/edit`}
                  className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-2.5 py-1.5 hover:border-accent hover:text-accent transition"
                >
                  編集
                </Link>
                {p.status === "published" && (
                  <Link
                    href={`/properties/${p.id}`}
                    target="_blank"
                    className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-2.5 py-1.5 hover:border-accent hover:text-accent transition"
                  >
                    公開↗
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
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
