"use client";

import { useState } from "react";
// ⚠ contact-requests.ts は "server-only"(node:fs) に依存するため、ここでは
// 型のみ import する（isolatedModules で type-only import は実行時コードを
// 含まないためクライアントバンドルは壊れない。payouts-admin.tsx と同じ罠）。
// ラベル定数はクライアント完結のためこのファイル内に複製する。
import type { ContactRequest, ContactType } from "@/lib/contact-requests";
import type { ContactMessage } from "@/lib/contact-messages";
import { setContactRequestStatusAction, deleteContactRequestAction } from "@/lib/admin-actions";
import ContactReplyForm from "@/components/admin/contact-reply-form";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";

const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  bug: "バグ報告",
  request: "ほしい物件追加",
  listing: "掲載依頼",
  general: "ご相談",
  license: "データ利用・提携のご相談",
  // ⚠ src/lib/contact-requests.ts の CONTACT_TYPE_LABEL と一字一句そろえること
  //   （このファイルは client なので複製している）。
  scan: "製作側スキャン依頼",
};

function fmtDate(iso: string) {
  return fmtDateTimeLocaleJST(iso);
}

/**
 * 1件の問い合わせ行。返信を重ねるほどスレッドが長くなり一覧が縦に
 * 膨らんでいた問題への対応 — 既定は折りたたみ（1行サマリーのみ）で、
 * クリックすると本文・添付・メールスレッド・返信フォームを展開する。
 */
export default function ContactRequestRow({
  request: c,
  thread,
}: {
  request: ContactRequest;
  thread: ContactMessage[];
}) {
  const [open, setOpen] = useState(false);

  const snippet = (c.message || "").replace(/\s+/g, " ").trim();

  return (
    <div
      className={`border rounded-md ${
        c.status === "new" ? "border-accent/60 bg-[#1a1a1a]" : "border-line"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center gap-3 flex-wrap"
      >
        <span className="mono text-[11px] opacity-50 shrink-0 select-none">
          {open ? "▾" : "▸"}
        </span>
        <span className="mono text-[10px] tracking-[0.16em] uppercase opacity-50 shrink-0">
          {fmtDate(c.createdAt)}
        </span>
        {c.status === "new" && (
          <span className="bg-accent text-white text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm shrink-0">
            NEW
          </span>
        )}
        {c.status === "archived" && (
          <span className="bg-neutral-700 text-neutral-300 text-[10px] mono tracking-[0.16em] uppercase px-2 py-0.5 rounded-sm shrink-0">
            アーカイブ
          </span>
        )}
        <span className="mono text-[10px] tracking-[0.16em] uppercase text-accent border border-accent/40 px-2 py-0.5 rounded-sm shrink-0">
          {CONTACT_TYPE_LABEL[c.type]}
        </span>
        <span className="text-[13px] font-medium shrink-0">
          {c.name || <span className="text-muted italic">（匿名）</span>}
        </span>
        <span className="text-[13px] text-muted truncate flex-1 min-w-[120px]">
          {snippet || <span className="italic">（本文なし）</span>}
        </span>
        {thread.length > 0 && (
          <span className="mono text-[10px] tracking-[0.12em] uppercase text-muted border border-line px-2 py-0.5 rounded-sm shrink-0">
            スレッド {thread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5">
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
            {/* 公開URL＝物件ID。公開後の変更は renamePropertyAction 経由のみなので、
                申請の時点でここを見て確定させる。 */}
            {c.publicUrl && (
              <div>
                <span className="text-muted mr-2">公開URL</span>
                <a
                  href={`https://${c.publicUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono text-[12px] text-accent hover:underline break-all"
                >
                  {c.publicUrl}
                </a>
              </div>
            )}
          </div>

          <div className="mb-3">
            <span
              className={`text-[11px] px-2 py-0.5 rounded-sm border ${
                c.emailed
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "bg-amber-50 text-amber-700 border-amber-300"
              }`}
              title={c.forwardedTo || "転送先未設定"}
            >
              {c.emailed ? `転送済 → ${c.forwardedTo}` : "メール未転送（要RESEND設定）"}
            </span>
          </div>

          <div className="bg-[#0f0f0f] border border-line rounded-md p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap mb-3">
            {c.message || <span className="text-muted italic">（本文なし）</span>}
          </div>

          {c.attachments.length > 0 && (
            <div className="mb-3">
              <div className="mono text-[10px] tracking-[0.18em] uppercase opacity-50 mb-2">
                添付画像（{c.attachments.length}枚）
              </div>
              <div className="flex flex-wrap gap-2">
                {c.attachments.map((u) => (
                  <a key={u} href={u} target="_blank" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt="添付画像"
                      className="h-28 w-auto border border-line rounded-sm hover:border-accent transition"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {thread.length > 0 ? (
            <div className="mb-3">
              <div className="mono text-[10px] tracking-[0.18em] uppercase opacity-50 mb-2">
                メールスレッド（{thread.length}件）
                {!c.replyEmailed && c.reply && (
                  <span className="ml-2 text-amber-600 normal-case tracking-normal">
                    ⚠ 直近のUI返信はメール未送達（RESEND未設定時に保存のみ）
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md p-3.5 text-[13.5px] leading-relaxed whitespace-pre-wrap border ${
                      m.direction === "outbound"
                        ? "bg-green-50 border-green-300 ml-6"
                        : "bg-white border-line mr-6"
                    }`}
                  >
                    <div className="mono text-[10px] opacity-50 mb-1.5">
                      {m.direction === "outbound" ? "運営 → 相手" : "相手 → 運営"} ・{" "}
                      {fmtDate(m.createdAt)}
                      {m.source === "admin-ui" && "（管理画面）"}
                      {m.subject ? ` ・ ${m.subject}` : ""}
                    </div>
                    {m.bodyText || <span className="text-muted italic">（本文なし）</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            c.reply && (
              <div className="mb-3">
                <div className="mono text-[10px] tracking-[0.18em] uppercase opacity-50 mb-2">
                  返信済み{c.repliedAt ? `（${fmtDate(c.repliedAt)}）` : ""}
                  {!c.replyEmailed && (
                    <span className="ml-2 text-amber-600 normal-case tracking-normal">
                      ⚠ メール未送達（RESEND未設定時に保存のみ）
                    </span>
                  )}
                </div>
                <div className="bg-green-50 border border-green-300 rounded-md p-3.5 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                  {c.reply}
                </div>
              </div>
            )
          )}

          <div className="flex flex-wrap items-start gap-2">
            {c.email ? (
              <ContactReplyForm requestId={c.id} toEmail={c.email} />
            ) : (
              <span
                className="text-[12px] border border-line text-muted/70 px-3 py-1.5 rounded-sm cursor-not-allowed"
                title="メールアドレスが未記入のため返信できません"
              >
                返信不可（メール未記入）
              </span>
            )}
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
            {c.status === "archived" && (
              <form action={setContactRequestStatusAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="read" />
                <button className="text-[12px] border border-line text-muted px-3 py-1.5 rounded-sm hover:text-ink transition">
                  アーカイブ解除
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
      )}
    </div>
  );
}
