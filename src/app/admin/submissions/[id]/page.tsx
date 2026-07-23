import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { scanSubmissionRepo } from "@/lib/scan-submissions-repo";
import { scanStatusLabel } from "@/lib/scan-submissions";
import { categoryLabel } from "@/lib/schemas";
import { userRepo } from "@/lib/users";
import { getUploadMode } from "@/lib/uploads";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";
import { SubmissionStatusForm, CreateDraftButton } from "@/components/admin/submission-actions";

export const metadata = { title: "持ち込みスキャン 詳細" };

export default async function AdminScanSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const submission = await scanSubmissionRepo.get(id);
  if (!submission) notFound();

  const applicant = await userRepo.get(submission.userId);
  const uploadMode = await getUploadMode();

  return (
    <div className="theme-online p-8 max-w-[900px]">
      <div className="mb-6">
        <Link href="/admin/submissions" className="text-[12px] text-muted hover:text-accent transition">
          ← 一覧に戻る
        </Link>
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mt-4 mb-1">
          Scan submission
        </div>
        <h1 className="serif text-2xl">
          {submission.locationName || "（無題）"}
          <span className="ml-3 align-middle mono text-[11px] tracking-[0.12em] uppercase text-accent border border-accent/40 rounded-full px-2.5 py-0.5">
            {scanStatusLabel(submission.status)}
          </span>
        </h1>
      </div>

      <div className="grid md:grid-cols-2 gap-x-8 gap-y-2 text-[14px] mb-6 border border-line rounded-md p-5">
        <Field label="申請者">{applicant?.email ?? submission.userId}</Field>
        <Field label="カテゴリ">{categoryLabel(submission.category)}</Field>
        <Field label="所在地">
          {submission.prefecture || submission.city
            ? `${submission.prefecture}${submission.city}`
            : "（未記入）"}
        </Field>
        <Field label="撮影機材">{submission.captureDevice || "（未記入）"}</Field>
        <Field label="撮影年月">{submission.capturedAt || "（未記入）"}</Field>
        <Field label="施設の連絡先">{submission.facilityContact || "（未記入）"}</Field>
        <Field label="申請日">{fmtDateTimeLocaleJST(submission.createdAt)}</Field>
        <Field label="同意日時">{fmtDateTimeLocaleJST(submission.agreedAt)}</Field>
        {submission.dataLink && (
          <Field label="データ共有リンク">
            <a href={submission.dataLink} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
              {submission.dataLink}
            </a>
          </Field>
        )}
        {submission.createdPropertyId && (
          <Field label="作成済み物件">
            <a href={`/admin/properties/${submission.createdPropertyId}/edit`} className="text-accent hover:underline">
              {submission.createdPropertyId} →
            </a>
          </Field>
        )}
      </div>

      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted mb-2">
          空間の説明・撮影範囲
        </div>
        <div className="bg-[#0f0f0f] border border-line rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap">
          {submission.description || <span className="text-muted italic">（本文なし）</span>}
        </div>
      </div>

      {submission.sampleImages.length > 0 && (
        <div className="mb-6">
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted mb-2">
            サンプル画像（{submission.sampleImages.length}枚）
          </div>
          <div className="flex flex-wrap gap-2">
            {submission.sampleImages.map((img) => (
              <a key={img.src} href={img.src} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.alt}
                  className="h-32 w-auto border border-line rounded-sm hover:border-accent transition"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {submission.status === "rejected" && (
        <div className="mb-6 text-[12.5px] border border-line rounded-md p-3.5">
          {uploadMode === "r2" ? (
            <span className="text-muted">
              見送り時にサンプル画像の削除を試みています（失敗分はサーバーログを確認してください）。
            </span>
          ) : (
            <span className="text-yellow-400">
              ローカルモードのため、サンプル画像（public/uploads/scan-{submission.id}/）の手動削除が必要です。
            </span>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <SubmissionStatusForm id={submission.id} initialStatus={submission.status} initialNote={submission.adminNote} />

        {submission.status === "cleared" && !submission.createdPropertyId && (
          <div className="border border-line rounded-md p-4">
            <div className="mono text-[10px] tracking-[0.18em] uppercase text-muted mb-3">
              物件化
            </div>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
              場所名・所在地・カテゴリ・説明を引き写した物件下書きを作成します。
            </p>
            <CreateDraftButton id={submission.id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted mr-2">{label}</span>
      <span>{children}</span>
    </div>
  );
}
