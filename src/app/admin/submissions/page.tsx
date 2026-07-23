import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { scanSubmissionRepo } from "@/lib/scan-submissions-repo";
import { SCAN_SUBMISSION_STATUSES, scanStatusLabel, type ScanSubmissionStatus } from "@/lib/scan-submissions";
import { categoryLabel } from "@/lib/schemas";
import { userRepo } from "@/lib/users";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";

export const metadata = { title: "持ち込みスキャン" };

const STATUS_BADGE_CLASS: Record<ScanSubmissionStatus, string> = {
  submitted: "bg-accent/10 text-accent border-accent/40",
  reviewing: "bg-accent/10 text-accent border-accent/40",
  clearing: "bg-accent/10 text-accent border-accent/40",
  cleared: "bg-green-900/30 text-green-400 border-green-800",
  rejected: "bg-neutral-800 text-neutral-400 border-neutral-700",
};

export default async function AdminScanSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // ページガード（server action 内では使わない — currentAdmin/assertAdmin を使用）。
  await requireAdmin();

  const { status: statusFilter } = await searchParams;
  const all = await scanSubmissionRepo.list();
  const submissions =
    statusFilter && SCAN_SUBMISSION_STATUSES.includes(statusFilter as ScanSubmissionStatus)
      ? all.filter((s) => s.status === statusFilter)
      : all;

  const users = await userRepo.list();
  const emailById = new Map(users.map((u) => [u.id, u.email] as const));

  return (
    <div className="theme-online p-8">
      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
          Scan submissions
        </div>
        <h1 className="serif text-3xl">持ち込みスキャン</h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">
          撮影者から届いた持ち込みスキャン申請。成立するまでは非公開で預かります。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 mono text-[10px] tracking-[0.18em] uppercase">
        <span className="text-muted mr-1">状態</span>
        <Link
          href="/admin/submissions"
          className={`px-3 py-1.5 border rounded-sm transition ${
            !statusFilter ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
          }`}
        >
          全て（{all.length}）
        </Link>
        {SCAN_SUBMISSION_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/submissions?status=${s}`}
            className={`px-3 py-1.5 border rounded-sm transition ${
              statusFilter === s ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {scanStatusLabel(s)}（{all.filter((x) => x.status === s).length}）
          </Link>
        ))}
      </div>

      {submissions.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          該当する申請はありません。
        </div>
      ) : (
        <div className="border border-line rounded-md overflow-hidden overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#141414] text-muted text-[11px] mono uppercase tracking-[0.1em]">
                <th className="text-left px-4 py-2.5">場所名</th>
                <th className="text-left px-4 py-2.5">申請者</th>
                <th className="text-left px-4 py-2.5">カテゴリ</th>
                <th className="text-left px-4 py-2.5">状態</th>
                <th className="text-left px-4 py-2.5">申請日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-[#141414] transition">
                  <td className="px-4 py-3">
                    <Link href={`/admin/submissions/${s.id}`} className="text-accent hover:underline">
                      {s.locationName || "（無題）"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{emailById.get(s.userId) ?? s.userId}</td>
                  <td className="px-4 py-3 text-muted">{categoryLabel(s.category)}</td>
                  <td className="px-4 py-3">
                    <span className={`mono text-[10px] tracking-[0.12em] uppercase border rounded-full px-2 py-0.5 ${STATUS_BADGE_CLASS[s.status]}`}>
                      {scanStatusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted mono text-[11px]">{fmtDateTimeLocaleJST(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
