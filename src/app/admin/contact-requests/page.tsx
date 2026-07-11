import Link from "next/link";
import { contactRequestRepo, CONTACT_TYPE_LABEL, type ContactType } from "@/lib/contact-requests";
import { setContactRequestStatusAction, deleteContactRequestAction } from "@/lib/admin-actions";

export const metadata = { title: "お問い合わせ（サイト全体）" };

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

export default async function AdminContactRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type: typeFilter } = await searchParams;
  const all = await contactRequestRepo.list();
  const newCount = all.filter((c) => c.status === "new").length;
  const requests = typeFilter ? all.filter((c) => c.type === typeFilter) : all;

  return (
    <div className="theme-online p-8">
      <div className="mb-6">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-1">
          Contact requests
        </div>
        <h1 className="serif text-3xl">
          お問い合わせ（サイト全体）
          {newCount > 0 && (
            <span className="ml-3 align-middle inline-block bg-accent text-white text-[12px] font-bold px-2 py-0.5 rounded-full">
              未読 {newCount}
            </span>
          )}
        </h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">
          サイト全体の /contact フォーム（バグ報告・ほしい物件追加・掲載依頼・ご相談）から届いた内容。運営メールへ自動転送されます。
          <br />
          メール転送には <code className="text-accent">RESEND_API_KEY</code> の設定が必要です（未設定でも内容はここに保存されます）。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 mono text-[10px] tracking-[0.18em] uppercase">
        <span className="text-muted mr-1">種別</span>
        <Link
          href="/admin/contact-requests"
          className={`px-3 py-1.5 border rounded-sm transition ${
            !typeFilter ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
          }`}
        >
          全て（{all.length}）
        </Link>
        {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((t) => (
          <Link
            key={t}
            href={`/admin/contact-requests?type=${t}`}
            className={`px-3 py-1.5 border rounded-sm transition ${
              typeFilter === t ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {CONTACT_TYPE_LABEL[t]}（{all.filter((c) => c.type === t).length}）
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          まだお問い合わせはありません。
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((c) => (
            <div
              key={c.id}
              className={`border rounded-md p-5 ${
                c.status === "new" ? "border-accent/60 bg-[#1a1a1a]" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="mono text-[10px] tracking-[0.16em] uppercase opacity-50">
                  {fmtDate(c.createdAt)}
                </span>
                {c.status === "new" && (
                  <span className="bg-accent text-white text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm">
                    NEW
                  </span>
                )}
                {c.status === "archived" && (
                  <span className="bg-neutral-700 text-neutral-300 text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm">
                    アーカイブ
                  </span>
                )}
                <span className="mono text-[10px] tracking-[0.16em] uppercase text-accent border border-accent/40 px-2 py-0.5 rounded-sm">
                  {CONTACT_TYPE_LABEL[c.type]}
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-sm ${
                    c.emailed ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"
                  }`}
                  title={c.forwardedTo || "転送先未設定"}
                >
                  {c.emailed ? `転送済 → ${c.forwardedTo}` : "メール未転送（要RESEND設定）"}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-x-8 gap-y-1.5 text-[14px] mb-3">
                <div>
                  <span className="text-muted mr-2">{c.type === "listing" ? "ご担当者名" : "お名前"}</span>
                  {c.name || <span className="text-muted italic">（匿名）</span>}
                  {c.company && <span className="text-muted">（{c.company}）</span>}
                </div>
                <div>
                  <span className="text-muted mr-2">メール</span>
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-accent hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-muted italic">（未記入）</span>
                  )}
                </div>
                {c.phone && (
                  <div>
                    <span className="text-muted mr-2">電話</span>
                    {c.phone}
                  </div>
                )}
                {c.url && (
                  <div>
                    <span className="text-muted mr-2">対象URL</span>
                    <a href={c.url} target="_blank" className="text-accent hover:underline break-all">
                      {c.url}
                    </a>
                  </div>
                )}
                {c.environment && (
                  <div>
                    <span className="text-muted mr-2">ご利用環境</span>
                    {c.environment}
                  </div>
                )}
                {c.area && (
                  <div>
                    <span className="text-muted mr-2">希望エリア</span>
                    {c.area}
                  </div>
                )}
                {c.propertyName && (
                  <div>
                    <span className="text-muted mr-2">物件名</span>
                    {c.propertyName}
                  </div>
                )}
                {c.address && (
                  <div>
                    <span className="text-muted mr-2">所在地</span>
                    {c.address}
                  </div>
                )}
              </div>

              <div className="bg-[#0f0f0f] border border-line rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
                {c.message || <span className="text-muted italic">（本文なし）</span>}
              </div>

              <div className="flex flex-wrap items-start gap-2">
                {c.status !== "read" && (
                  <form action={setContactRequestStatusAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="read" />
                    <button className="text-[12px] border border-line text-ink px-3 py-1.5 rounded-sm hover:border-accent hover:text-accent transition">
                      既読にする
                    </button>
                  </form>
                )}
                {c.status !== "archived" && (
                  <form action={setContactRequestStatusAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button className="text-[12px] border border-line text-muted px-3 py-1.5 rounded-sm hover:text-ink transition">
                      アーカイブ
                    </button>
                  </form>
                )}
                <form action={deleteContactRequestAction}>
                  <input type="hidden" name="id" value={c.id} />
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
