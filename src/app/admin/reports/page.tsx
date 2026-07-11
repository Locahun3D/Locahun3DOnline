import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { commentRepo, type Comment } from "@/lib/comments";
import { reviewRepo, type Review } from "@/lib/reviews";
import { repo } from "@/lib/store";
import { unhideCommentAction, deleteCommentAction } from "@/lib/comment-actions";
import { unhideReviewAction, deleteReviewAction } from "@/lib/review-actions";

export const metadata = { title: "通報管理" };

// 既存の unhide/delete action は (id, revalidate) => Promise<{ok}> を返す
// 通常の非同期関数呼び出し用シグネチャ。<form action> は
// (formData) => Promise<void> を要求するため、戻り値を捨てる薄いラッパーを
// 挟む（インライン "use server" — Next.js が自動でサーバーアクション化する）。
async function unhideCommentFormAction(id: string, revalidate: string) {
  "use server";
  await unhideCommentAction(id, revalidate);
}
async function deleteCommentFormAction(id: string, revalidate: string) {
  "use server";
  await deleteCommentAction(id, revalidate);
}
async function unhideReviewFormAction(id: string, revalidate: string) {
  "use server";
  await unhideReviewAction(id, revalidate);
}
async function deleteReviewFormAction(id: string, revalidate: string) {
  "use server";
  await deleteReviewAction(id, revalidate);
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type ReportedItem = {
  kind: "comment" | "review";
  id: string;
  propertyId: string;
  userId: string;
  userName: string;
  body: string;
  rating?: number;
  createdAt: string;
  reportCount: number;
  hiddenByReports: boolean;
};

export default async function AdminReportsPage() {
  await requireAdmin();

  const [comments, reviews, properties] = await Promise.all([
    commentRepo.listAll(),
    reviewRepo.listAll(),
    repo.list(),
  ]);

  const titleOf = new Map(properties.map((p) => [p.id, p.title || p.id]));

  const items: ReportedItem[] = [
    ...comments
      .filter((c: Comment) => c.reports.length > 0)
      .map((c: Comment): ReportedItem => ({
        kind: "comment",
        id: c.id,
        propertyId: c.propertyId,
        userId: c.userId,
        userName: c.userName,
        body: c.body,
        createdAt: c.createdAt,
        reportCount: c.reports.length,
        hiddenByReports: c.hiddenByReports,
      })),
    ...reviews
      .filter((r: Review) => r.reports.length > 0)
      .map((r: Review): ReportedItem => ({
        kind: "review",
        id: r.id,
        propertyId: r.propertyId,
        userId: r.userId,
        userName: r.userName,
        body: r.body,
        rating: r.rating,
        createdAt: r.createdAt,
        reportCount: r.reports.length,
        hiddenByReports: r.hiddenByReports,
      })),
  ].sort((a, b) => {
    // 非表示中のものを先頭に、その中では通報数が多い順
    if (a.hiddenByReports !== b.hiddenByReports) return a.hiddenByReports ? -1 : 1;
    return b.reportCount - a.reportCount;
  });

  const hiddenCount = items.filter((i) => i.hiddenByReports).length;

  return (
    <div className="theme-online p-8">
      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
          Reports
        </div>
        <h1 className="serif text-3xl">
          通報管理
          {hiddenCount > 0 && (
            <span className="ml-3 align-middle inline-block bg-red-900/40 text-red-300 text-[12px] font-bold px-2 py-0.5 rounded-full">
              非表示中 {hiddenCount}
            </span>
          )}
        </h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">
          掲示板・レビューへの通報を全物件横断で一覧します。1件でも通報があれば表示され、3件で自動的に非表示になります。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          通報された投稿はありません。
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((i) => (
            <div
              key={`${i.kind}-${i.id}`}
              className={`border rounded-md p-5 ${
                i.hiddenByReports ? "border-red-900/50 bg-[#1a1414]" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="mono text-[10px] tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm bg-[#262626] text-muted">
                  {i.kind === "comment" ? "掲示板" : "レビュー"}
                </span>
                {i.kind === "review" && i.rating != null && (
                  <span className="mono text-[11px] text-accent">{"★".repeat(i.rating)}{"☆".repeat(5 - i.rating)}</span>
                )}
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-sm ${
                    i.hiddenByReports ? "bg-red-900/30 text-red-300" : "bg-yellow-900/30 text-yellow-400"
                  }`}
                >
                  {i.hiddenByReports ? `非表示中（通報 ${i.reportCount} 件）` : `通報 ${i.reportCount} 件`}
                </span>
                <span className="mono text-[10px] tracking-[0.16em] uppercase opacity-50">
                  {fmtDate(i.createdAt)}
                </span>
                <Link
                  href={`/properties/${i.propertyId}`}
                  target="_blank"
                  className="ml-auto text-[12px] text-accent hover:underline"
                >
                  {titleOf.get(i.propertyId) || i.propertyId} ↗
                </Link>
              </div>

              <div className="text-[13px] text-muted mb-2">
                投稿者: {i.userName}
              </div>

              <div className="bg-[#0f0f0f] border border-line rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
                {i.body || "（本文なし・星のみ）"}
              </div>

              <div className="flex flex-wrap gap-2">
                {i.hiddenByReports && (
                  <form
                    action={
                      i.kind === "comment"
                        ? unhideCommentFormAction.bind(null, i.id, "/admin/reports")
                        : unhideReviewFormAction.bind(null, i.id, "/admin/reports")
                    }
                  >
                    <button className="text-[12px] border border-accent text-accent px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition">
                      表示に戻す
                    </button>
                  </form>
                )}
                <form
                  action={
                    i.kind === "comment"
                      ? deleteCommentFormAction.bind(null, i.id, "/admin/reports")
                      : deleteReviewFormAction.bind(null, i.id, "/admin/reports")
                  }
                >
                  <button className="text-[12px] border border-red-900/50 text-red-400 px-3 py-1.5 rounded-sm hover:bg-red-900/20 transition">
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
