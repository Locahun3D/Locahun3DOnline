import Link from "next/link";
import { inquiryRepo } from "@/lib/inquiries";
import { setInquiryStatusAction, deleteInquiryAction } from "@/lib/admin-actions";
import InquiryReplyForm from "@/components/admin/inquiry-reply-form";

export const metadata = { title: "問い合わせ" };

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

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ purpose?: string }>;
}) {
  const { purpose: purposeFilter } = await searchParams;
  const all = await inquiryRepo.list();
  const newCount = all.filter((i) => i.status === "new").length;
  const purposes = [...new Set(all.map((i) => i.purpose).filter(Boolean))].sort();
  const inquiries = purposeFilter ? all.filter((i) => i.purpose === purposeFilter) : all;

  return (
    <div className="theme-online p-8">
      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
          Inquiries
        </div>
        <h1 className="serif text-3xl">
          問い合わせ
          {newCount > 0 && (
            <span className="ml-3 align-middle inline-block bg-accent text-white text-[12px] font-bold px-2 py-0.5 rounded-full">
              未読 {newCount}
            </span>
          )}
        </h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">
          公開フォームから届いたスタジオへの問い合わせ。各物件の「スタジオ連絡先メール」へ自動転送されます。
          <br />
          メール転送には <code className="text-accent">RESEND_API_KEY</code> の設定が必要です（未設定でも内容はここに保存されます）。
        </p>
      </div>

      {purposes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6 mono text-[10px] tracking-[0.18em] uppercase">
          <span className="text-muted mr-1">種別</span>
          <Link
            href="/admin/inquiries"
            className={`px-3 py-1.5 border rounded-sm transition ${
              !purposeFilter
                ? "border-accent text-accent"
                : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            全て（{all.length}）
          </Link>
          {purposes.map((p) => (
            <Link
              key={p}
              href={`/admin/inquiries?purpose=${encodeURIComponent(p)}`}
              className={`px-3 py-1.5 border rounded-sm transition ${
                purposeFilter === p
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {p}（{all.filter((i) => i.purpose === p).length}）
            </Link>
          ))}
        </div>
      )}

      {inquiries.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          まだ問い合わせはありません。
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {inquiries.map((i) => (
            <div
              key={i.id}
              className={`border rounded-md p-5 ${
                i.status === "new" ? "border-accent/60 bg-[#1a1a1a]" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="mono text-[10px] tracking-[0.16em] uppercase opacity-50">
                  {fmtDate(i.createdAt)}
                </span>
                {i.status === "new" && (
                  <span className="bg-accent text-white text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm">
                    NEW
                  </span>
                )}
                {i.status === "archived" && (
                  <span className="bg-neutral-700 text-neutral-300 text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm">
                    アーカイブ
                  </span>
                )}
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-sm ${
                    i.emailed
                      ? "bg-green-900/30 text-green-400"
                      : "bg-yellow-900/30 text-yellow-400"
                  }`}
                  title={i.forwardedTo || "先方メール未設定"}
                >
                  {i.emailed ? `転送済 → ${i.forwardedTo}` : "メール未転送（要RESEND設定）"}
                </span>
                <Link
                  href={`/properties/${i.propertyId}`}
                  target="_blank"
                  className="ml-auto text-[12px] text-accent hover:underline"
                >
                  {i.propertyTitle || i.propertyId} ↗
                </Link>
              </div>

              <div className="grid md:grid-cols-2 gap-x-8 gap-y-1.5 text-[14px] mb-3">
                <div>
                  <span className="text-muted mr-2">お名前</span>
                  {i.name}
                  {i.company && <span className="text-muted">（{i.company}）</span>}
                </div>
                <div>
                  <span className="text-muted mr-2">メール</span>
                  <a href={`mailto:${i.email}`} className="text-accent hover:underline">
                    {i.email}
                  </a>
                </div>
                {i.phone && (
                  <div>
                    <span className="text-muted mr-2">電話</span>
                    {i.phone}
                  </div>
                )}
                {i.purpose && (
                  <div>
                    <span className="text-muted mr-2">利用目的</span>
                    {i.purpose}
                  </div>
                )}
                {i.preferredDate && (
                  <div>
                    <span className="text-muted mr-2">利用希望日</span>
                    {i.preferredDate}
                  </div>
                )}
                {i.preferredTime && (
                  <div>
                    <span className="text-muted mr-2">希望時間帯</span>
                    {i.preferredTime}
                  </div>
                )}
              </div>

              <div className="bg-[#0f0f0f] border border-line rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
                {i.message || <span className="text-muted italic">（本文なし）</span>}
              </div>

              {i.reply && (
                <div className="bg-[#0a1a0a] border border-green-900/40 rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
                  <div className="mono text-[10px] tracking-[0.16em] uppercase text-green-600 mb-1.5">
                    返信済み{i.repliedAt ? `（${fmtDate(i.repliedAt)}）` : ""}
                  </div>
                  {i.reply}
                </div>
              )}

              <div className="flex flex-wrap items-start gap-2">
                <InquiryReplyForm inquiryId={i.id} toEmail={i.email} />
                {i.status !== "read" && (
                  <form action={setInquiryStatusAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value="read" />
                    <button className="text-[12px] border border-line text-ink px-3 py-1.5 rounded-sm hover:border-accent hover:text-accent transition">
                      既読にする
                    </button>
                  </form>
                )}
                {i.status !== "archived" && (
                  <form action={setInquiryStatusAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button className="text-[12px] border border-line text-muted px-3 py-1.5 rounded-sm hover:text-ink transition">
                      アーカイブ
                    </button>
                  </form>
                )}
                <form action={deleteInquiryAction}>
                  <input type="hidden" name="id" value={i.id} />
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
