"use client";

import { useActionState } from "react";
import { submitInquiryAction, type InquiryState } from "@/lib/inquiry-actions";
import { useLocale } from "@/components/locale-provider";

const inputClass =
  "w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition";

/**
 * スタジオ問い合わせフォーム（公開）。送信内容は保存され、先方メール
 * （property.contactEmail）へ直接転送される。
 * option の value は日本語で固定（先方に届く値の一貫性を保つ）、ラベルのみ locale 化。
 */
export default function InquiryForm({
  propertyId,
  propertyTitle,
}: {
  propertyId: string;
  propertyTitle: string;
}) {
  const en = useLocale() === "en";
  const [state, formAction, pending] = useActionState<InquiryState, FormData>(
    submitInquiryAction,
    undefined,
  );
  const req = <span className="text-red-500 text-[11px]">{en ? "required" : "必須"}</span>;

  if (state?.ok) {
    return (
      <div className="bg-white p-8 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[17px] font-bold text-ink mb-1.5">
          {en ? "Your inquiry has been sent" : "お問い合わせを送信しました"}
        </h3>
        <p className="text-[13px] text-ink/60 leading-relaxed">
          {en ? (
            <>
              Our team will get back to you shortly.
              <br />
              Please watch for a reply at the email address you provided.
            </>
          ) : (
            <>
              担当者より折り返しご連絡いたします。
              <br />
              ご記入のメールアドレス宛の返信をお待ちください。
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white p-6 space-y-5">
      <input type="hidden" name="propertyId" value={propertyId} />

      {/* 2-col: name + company */}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
            {en ? "Name" : "お名前"} {req}
          </span>
          <input name="name" type="text" placeholder={en ? "Jane Smith" : "山田 太郎"} required className={inputClass} />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">{en ? "Company" : "会社名"}</span>
          <input name="company" type="text" placeholder={en ? "ACME Inc." : "株式会社〇〇"} className={inputClass} />
        </label>
      </div>

      {/* 2-col: email + phone */}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
            {en ? "Email" : "メールアドレス"} {req}
          </span>
          <input name="email" type="email" placeholder="info@example.com" required className={inputClass} />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">{en ? "Phone" : "電話番号"}</span>
          <input name="phone" type="tel" placeholder="090-0000-0000" className={inputClass} />
        </label>
      </div>

      {/* 2-col: purpose + date */}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
            {en ? "Purpose" : "利用目的"} {req}
          </span>
          <select name="purpose" required className={`${inputClass} bg-white`} defaultValue="">
            <option value="" disabled>{en ? "Please select" : "選択してください"}</option>
            <option value="スチール撮影">{en ? "Still photography" : "スチール撮影"}</option>
            <option value="ムービー / CM撮影">{en ? "Film / commercial" : "ムービー / CM撮影"}</option>
            <option value="ロケハン（内見）">{en ? "Location scouting" : "ロケハン（内見）"}</option>
            <option value="イベント / 展示会">{en ? "Event / exhibition" : "イベント / 展示会"}</option>
            <option value="その他">{en ? "Other" : "その他"}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">{en ? "Preferred date" : "利用希望日"}</span>
          <input name="preferredDate" type="date" className={inputClass} />
        </label>
      </div>

      {/* Message */}
      <label className="block">
        <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
          {en ? "Message" : "お問い合わせ内容"} {req}
        </span>
        <textarea
          name="message"
          rows={4}
          required
          placeholder={en ? "Tell us your timing, party size, any equipment to bring in, etc." : "ご利用時間、人数、搬入物の有無など詳細をお聞かせください"}
          className={`${inputClass} leading-relaxed resize-y`}
        />
      </label>

      {state?.ok === false && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5">
          {state.error}
        </p>
      )}

      {/* Submit — stack on mobile so the button isn't squeezed by the note */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="w-full sm:w-auto bg-accent text-white text-[15px] font-bold px-8 py-3.5 rounded-md hover:bg-accent/85 transition shadow-sm disabled:opacity-50"
        >
          {pending ? (en ? "Sending…" : "送信中…") : en ? "Send" : "送信する"}
        </button>
        <span className="text-[12px] text-ink/40">
          {en
            ? `※ Your inquiry is sent directly to the ${propertyTitle} team`
            : `※ お問い合わせは ${propertyTitle} の担当者へ直接送信されます`}
        </span>
      </div>
    </form>
  );
}
