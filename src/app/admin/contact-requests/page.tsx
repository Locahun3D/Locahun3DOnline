import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { contactRequestRepo, CONTACT_TYPE_LABEL, type ContactType } from "@/lib/contact-requests";
import { contactMessageRepo, groupMessagesByCounterpart } from "@/lib/contact-messages";
import ContactRequestRow from "@/components/admin/contact-request-row";

export const metadata = { title: "お問い合わせ（サイト全体）" };

/** box/type を保ちつつ href を組み立てる（アーカイブ絞り込み中でも種別を切替できるように）。 */
function hrefFor(box: string | undefined, type?: string) {
  const params = new URLSearchParams();
  if (box === "archive") params.set("box", "archive");
  if (type) params.set("type", type);
  const qs = params.toString();
  return `/admin/contact-requests${qs ? `?${qs}` : ""}`;
}

export default async function AdminContactRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; box?: string }>;
}) {
  await requireAdmin();

  const { type: typeFilter, box } = await searchParams;
  const showArchived = box === "archive";

  const all = await contactRequestRepo.list();
  const newCount = all.filter((c) => c.status === "new").length;
  const archivedCount = all.filter((c) => c.status === "archived").length;
  const inboxCount = all.length - archivedCount;

  // 1段目: 受信箱(非アーカイブ) / アーカイブ。2段目: そのスコープ内での種別絞り込み
  // （アーカイブが増えて一覧が延々スクロールする問題と、アーカイブ済みの
  // 見返しにくさの両方に対応 — Gmailの受信トレイ/アーカイブと同じ構造）。
  const scoped = all.filter((c) => (showArchived ? c.status === "archived" : c.status !== "archived"));
  const requests = typeFilter ? scoped.filter((c) => c.type === typeFilter) : scoped;

  // メールスレッド（現状は「この画面から送った返信」のみ）を相手メールで突き合わせ。
  // ⚠ お客様からの返信の取り込みは実装していない。理由と将来案は
  //    docs/inbound-email-decision-2026-07-28.md を読むこと
  //    （Cloudflare Email Routing はルートにMXを置く仕様で Google Workspace の
  //      受信を壊すため使えない。サブドメイン別ゾーンは Enterprise 限定）。
  const threads = groupMessagesByCounterpart(await contactMessageRepo.list());

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
          メール転送には <code className="text-accent">RESEND_API_KEY</code> の設定が必要です（未設定でも内容はここに保存されます）。クリックで各行の詳細・返信フォームが開きます。
          <br />
          <span className="text-accent">お客様からの返信メールはこの画面には出ません。</span>
          {" "}
          <code className="text-accent">contact@locahun3d.com</code>（Gmail）でご確認ください。ここに出るのは、フォームからの受信と、この画面から送った返信だけです。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 mono text-[10px] tracking-[0.18em] uppercase">
        <Link
          href={hrefFor(undefined, typeFilter)}
          className={`px-3 py-1.5 border rounded-sm transition ${
            !showArchived ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
          }`}
        >
          受信箱（{inboxCount}）
        </Link>
        <Link
          href={hrefFor("archive", typeFilter)}
          className={`px-3 py-1.5 border rounded-sm transition ${
            showArchived ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
          }`}
        >
          アーカイブ（{archivedCount}）
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 mono text-[10px] tracking-[0.18em] uppercase">
        <span className="text-muted mr-1">種別</span>
        <Link
          href={hrefFor(box)}
          className={`px-3 py-1.5 border rounded-sm transition ${
            !typeFilter ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
          }`}
        >
          全て（{scoped.length}）
        </Link>
        {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((t) => (
          <Link
            key={t}
            href={hrefFor(box, t)}
            className={`px-3 py-1.5 border rounded-sm transition ${
              typeFilter === t ? "border-accent text-accent" : "border-line text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {CONTACT_TYPE_LABEL[t]}（{scoped.filter((c) => c.type === t).length}）
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="border border-line rounded-md p-10 text-center text-muted text-[14px]">
          {showArchived ? "アーカイブされたお問い合わせはありません。" : "まだお問い合わせはありません。"}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((c) => (
            <ContactRequestRow
              key={c.id}
              request={c}
              thread={c.email ? (threads.get(c.email.toLowerCase()) ?? []) : []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
