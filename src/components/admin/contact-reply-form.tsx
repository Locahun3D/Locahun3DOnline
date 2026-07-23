"use client";

import { useActionState, useState } from "react";
import {
  replyToContactRequestAction,
  type ReplyInquiryState,
} from "@/lib/admin-actions";

/**
 * /admin/contact-requests の返信フォーム（inquiry-reply-form と同型）。
 * 相手への到達経路はメールのみ（匿名フォームで userId を持たない）ため、
 * メール未記入の問い合わせでは呼び出し元でこのフォームを出さないこと。
 * 送信メールの差出人は contact@locahun3d.com（notifyContactReply）。
 */
export default function ContactReplyForm({
  requestId,
  toEmail,
}: {
  requestId: string;
  toEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ReplyInquiryState, FormData>(
    replyToContactRequestAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="text-[12px] text-green-700 border border-green-300 bg-green-50 px-3 py-2 rounded-sm">
        返信を送信しました → {toEmail}（差出人: contact@locahun3d.com）
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] border border-accent text-accent px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition"
      >
        返信する
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      <input type="hidden" name="id" value={requestId} />
      {/* ライトテーマ画面（白カード）— ダーク用 bg-[#0f0f0f] だと入力文字が見えない */}
      <textarea
        name="reply"
        rows={4}
        required
        maxLength={4000}
        placeholder={`${toEmail} 宛に contact@locahun3d.com から送信されます`}
        className="w-full bg-white text-ink border border-line rounded-md px-3 py-2 text-[13px] leading-relaxed resize-y focus:border-accent outline-none transition"
      />
      {state && !state.ok && (
        <p className="text-[12px] text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="text-[12px] border border-accent bg-accent text-bg px-3 py-1.5 rounded-sm hover:brightness-95 transition disabled:opacity-50"
        >
          {pending ? "送信中…" : "送信"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-[12px] border border-line text-muted px-3 py-1.5 rounded-sm hover:text-ink transition"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
