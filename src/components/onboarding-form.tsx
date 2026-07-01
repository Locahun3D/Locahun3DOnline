"use client";

import { useActionState, useState } from "react";
import { onboardingAction } from "@/lib/auth-actions";
import {
  SELF_SIGNUP_ROLES,
  roleLabel,
  roleDescription,
  requiresApproval,
  requiresNda,
  type AccountRole,
} from "@/lib/account-schema";
import { useLocale } from "@/components/locale-provider";

const FIELD =
  "w-full bg-bg border border-line px-3 py-2.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none transition";
const LABEL =
  "mono text-[10px] tracking-[0.22em] uppercase text-muted mb-1.5 block";

export default function OnboardingForm() {
  const en = useLocale() === "en";
  const lc = en ? "en" : "ja";
  const [state, action, pending] = useActionState(onboardingAction, undefined);
  const [role, setRole] = useState<AccountRole>("individual");

  return (
    <form action={action} className="space-y-5">
      <div>
        <span className={LABEL}>{en ? "Account type" : "アカウント種別"}</span>
        <div className="grid gap-2">
          {SELF_SIGNUP_ROLES.map((r) => (
            <label
              key={r}
              className={`flex gap-3 border p-3 cursor-pointer transition ${
                role === r
                  ? "border-accent bg-[#222]"
                  : "border-line hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="mt-1 accent-[#5ec8e8]"
              />
              <span>
                <span className="text-[13px] text-ink">{roleLabel(r, lc)}</span>
                <span className="block text-[11px] text-muted leading-[1.6] mt-0.5">
                  {roleDescription(r, lc)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {(role === "studio" || role === "production") && (
        <div>
          <label className={LABEL} htmlFor="company">
            {role === "studio" ? (en ? "Studio / trade name" : "スタジオ / 屋号") : en ? "Company" : "会社名"}
          </label>
          <input
            id="company"
            name="company"
            className={FIELD}
            placeholder={role === "studio" ? (en ? "ACME Studio" : "○○スタジオ") : en ? "ACME Inc." : "株式会社○○"}
          />
        </div>
      )}

      <div>
        <label className={LABEL} htmlFor="phone">
          {en ? "Phone (optional)" : "電話番号（任意）"}
        </label>
        <input id="phone" name="phone" className={FIELD} placeholder="03-0000-0000" />
      </div>

      {requiresNda(role) && (
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
      )}
      {state?.errors?.nda && (
        <p className="text-[11px] text-red-400">{state.errors.nda.join(" / ")}</p>
      )}

      {requiresApproval(role) && (
        <p className="text-[11px] text-muted leading-[1.7] border-l-2 border-line pl-3">
          {en
            ? `${roleLabel(role, "en")} accounts are activated after our team approves them. You can sign in before approval, but pro features are limited.`
            : `${roleLabel(role, "ja")}アカウントは登録後、運営の承認をもって有効化されます。承認まではログインはできますが、プロ機能は制限されます。`}
        </p>
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
        {pending ? (en ? "Saving…" : "保存中…") : en ? "Get started" : "はじめる"}
      </button>
    </form>
  );
}
