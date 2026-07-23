"use client";

import { useActionState } from "react";
import { requestProductionUpgradeAction, type ProductionUpgradeState } from "@/lib/auth-actions";
import { useLocale } from "@/components/locale-provider";

const FIELD =
  "w-full bg-bg border border-line px-3 py-2.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none transition";
const LABEL =
  "mono text-[10px] tracking-[0.22em] uppercase text-muted mb-1.5 block";

export default function ProductionUpgradeForm() {
  const en = useLocale() === "en";
  const [state, action, pending] = useActionState<ProductionUpgradeState, FormData>(
    requestProductionUpgradeAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="border border-accent/50 bg-accent/10 px-6 py-8 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[15px] font-bold text-ink mb-3">
          {en ? "Your application has been submitted" : "申請を送信しました"}
        </h3>
        <ul className="text-[12.5px] text-muted leading-[1.9] text-left max-w-[38ch] mx-auto list-disc pl-5 space-y-1">
          <li>
            {en
              ? "Our team will review your company details and NDA agreement."
              : "会社情報とNDA同意の内容を運営が確認します。"}
          </li>
          <li>
            {en
              ? "You can keep signing in and using non-restricted features while it's under review."
              : "審査中もサインインでき、機密ロケ地以外の機能は引き続きご利用いただけます。"}
          </li>
          <li>
            {en
              ? "We'll notify you in your account page once it's approved (or if it isn't)."
              : "承認され次第（見送りとなった場合も）、マイページの通知でご連絡します。"}
          </li>
        </ul>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className={LABEL} htmlFor="company">
          {en ? "Company" : "会社名"}
        </label>
        <input
          id="company"
          name="company"
          required
          className={FIELD}
          placeholder={en ? "ACME Inc." : "株式会社○○"}
        />
        {state?.errors?.company && (
          <p className="text-[11px] text-red-400 mt-1.5">{state.errors.company.join(" / ")}</p>
        )}
      </div>

      <div>
        <label className={LABEL} htmlFor="phone">
          {en ? "Phone (optional)" : "電話番号（任意）"}
        </label>
        <input id="phone" name="phone" className={FIELD} placeholder="03-0000-0000" />
      </div>

      <label className="flex gap-3 items-start border border-accent/40 bg-[#1e1e1e] p-3 text-[12px] leading-[1.7]">
        <input type="checkbox" name="nda" className="mt-0.5 accent-[#5ec8e8]" />
        <span className="text-muted">
          {en ? (
            <>
              Viewing confidential locations (backyards, private studios, etc.) requires
              agreement to a <strong className="text-ink">non-disclosure agreement (NDA)</strong>.
              I have read and agree to it.
            </>
          ) : (
            <>
              機密ロケ地（倉庫裏・非公開スタジオ等）の閲覧には
              <strong className="text-ink">秘密保持契約（NDA）</strong>
              への同意が必要です。内容を確認し同意します。
            </>
          )}
        </span>
      </label>
      {state?.errors?.nda && (
        <p className="text-[11px] text-red-400">{state.errors.nda.join(" / ")}</p>
      )}

      <p className="text-[11px] text-muted leading-[1.7] border-l-2 border-line pl-3">
        {en
          ? "Submitting switches your account type to Production and puts it under review. You can sign in during the review, but Team-only features stay locked until our team approves it."
          : "送信するとアカウント種別が「制作会社」に切り替わり、運営の承認待ちになります。承認までもサインインは可能ですが、Team限定機能は承認後に解放されます。"}
      </p>

      {state?.errors?.email && (
        <p className="text-[11px] text-red-400">{state.errors.email.join(" / ")}</p>
      )}

      {state?.message && (
        <p className="text-[12px] text-red-400 border border-red-400/40 bg-red-400/10 px-3 py-2">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-50"
      >
        {pending ? (en ? "Submitting…" : "送信中…") : en ? "Apply" : "申請する"}
      </button>
    </form>
  );
}
