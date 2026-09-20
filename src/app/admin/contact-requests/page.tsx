import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { contactRequestRepo, CONTACT_TYPE_LABEL, type ContactType } from "@/lib/contact-requests";
import { contactMessageRepo, groupMessagesByCounterpart } from "@/lib/contact-messages";
import AdminPageHeader, { AdminPageShell, AdminEmpty, adminChip } from "@/components/admin/admin-page-header";
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
    <AdminPageShell className="theme-online">
      {/* 2026-09-20: 小型ヘッダーへ。3行あった説明は「返信メールはここに出ない」の1点だけ残し、残りは「使い方」に畳んだ。 */}
      <AdminPageHeader
        title="サイトへの問い合わせ"
        count={newCount > 0 ? <span className="inline-block bg-accent text-white text-[12px] font-bold px-2 py-0.5 rounded-full">未読 {newCount}</span> : undefined}
        description={<>お客様からの返信メールはここに出ません。contact@locahun3d.com（Gmail）で確認してください。</>}
        help="サイトのお問い合わせフォーム（バグ報告・ほしい物件追加・掲載依頼・ご相談）から届いた内容で、運営メールへも自動転送されます。行をクリックすると詳細と返信フォームが開きます。ここに出るのは、フォームからの受信と、この画面から送った返信だけです。"
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Link href={hrefFor(undefined, typeFilter)} className={adminChip(!showArchived)}>
          受信箱（{inboxCount}）
        </Link>
        <Link href={hrefFor("archive", typeFilter)} className={adminChip(showArchived)}>
          アーカイブ（{archivedCount}）
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-muted text-[12px] mr-1">種別</span>
        <Link href={hrefFor(box)} className={adminChip(!typeFilter)}>
          全て（{scoped.length}）
        </Link>
        {(Object.keys(CONTACT_TYPE_LABEL) as ContactType[]).map((t) => (
          <Link key={t} href={hrefFor(box, t)} className={adminChip(typeFilter === t)}>
            {CONTACT_TYPE_LABEL[t]}（{scoped.filter((c) => c.type === t).length}）
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <AdminEmpty>{showArchived ? "アーカイブはありません。" : "問い合わせはありません。"}</AdminEmpty>
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
    </AdminPageShell>
  );
}
