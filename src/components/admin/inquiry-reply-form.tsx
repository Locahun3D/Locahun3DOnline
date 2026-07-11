"use client";

import { useActionState, useState } from "react";
import {
  replyToInquiryAction,
  type ReplyInquiryState,
} from "@/lib/admin-actions";

export default function InquiryReplyForm({
  inquiryId,
  toEmail,
}: {
  inquiryId: string;
  toEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ReplyInquiryState, FormData>(
    replyToInquiryAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="text-[12px] text-green-400 border border-green-900/50 bg-green-900/20 px-3 py-2 rounded-sm">
        返信を送信しました → {toEmail}
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
      <input type="hidden" name="id" value={inquiryId} />
      <textarea
        name="reply"
        rows={3}
        required
        maxLength={4000}
        placeholder={`${toEmail} 宛に送信されます`}
        className="w-full bg-[#0f0f0f] border border-line rounded-md px-3 py-2 text-[13px] leading-relaxed resize-y focus:border-accent outline-none transition"
      />
      {state && !state.ok && (
        <p className="text-[12px] text-red-400">{state.error}</p>
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
