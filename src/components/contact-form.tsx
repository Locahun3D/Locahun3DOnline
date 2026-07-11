"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContactRequestAction, type ContactState } from "@/lib/contact-actions";
import type { ContactType } from "@/lib/contact-requests";

const HONEYPOT_FIELD = "website";
const RENDERED_AT_FIELD = "_rt";

const inputClass =
  "w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition";

/**
 * /contact/[type] の各専用ページで使う共通フォーム。type ごとに項目を出し分ける
 * （デザイン案 Pattern 7 の承認済みフィールド構成をそのまま実装）。
 */
export default function ContactForm({ type }: { type: ContactType }) {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitContactRequestAction,
    undefined,
  );
  const renderedAtRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renderedAtRef.current) renderedAtRef.current.value = String(Date.now());
  }, []);

  if (state?.ok) {
    return (
      <div className="bg-white border border-line px-8 py-11 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[16px] font-bold text-ink mb-2">お問い合わせを送信しました</h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          担当者より折り返しご連絡いたします。
          <br />
          ご記入のメールアドレス宛の返信をお待ちください。
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line px-7 py-8 sm:px-8">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name={RENDERED_AT_FIELD} ref={renderedAtRef} defaultValue="" />
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="space-y-5">
        {type === "bug" && (
          <>
            <Field label="発生したページのURL" required>
              <input name="url" type="url" placeholder="https://locahun3d.com/properties/..." className={inputClass} />
            </Field>
            <Field label="症状・再現手順" required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={"例: 物件詳細で3Dビューアーを開くと画面が真っ暗になります。\n手順: 1. 物件一覧から〇〇を開く 2.「3Dで見る」を押す"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
            <Field label="ご利用環境" optional>
              <input name="environment" type="text" placeholder="例: Windows 11 / Chrome 138" className={inputClass} />
            </Field>
          </>
        )}

        {type === "request" && (
          <>
            <Field label="希望エリア" required>
              <input name="area" type="text" placeholder="例: 東京都 世田谷区 周辺" className={inputClass} />
            </Field>
            <Field label="撮影の用途・ほしい条件" required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder="例: MV撮影で使える廃工場系のロケ地を探しています。天井高4m以上・搬入経路があると理想です。"
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "listing" && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="会社名・オーナー名" required>
                <input name="company" type="text" placeholder="株式会社〇〇" className={inputClass} />
              </Field>
              <Field label="物件名" required>
                <input name="propertyName" type="text" placeholder="例: 〇〇スタジオ" className={inputClass} />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="所在地" required>
                <input name="address" type="text" placeholder="例: 東京都渋谷区…" className={inputClass} />
              </Field>
              <Field label="電話番号" optional>
                <input name="phone" type="tel" placeholder="03-0000-0000" className={inputClass} />
              </Field>
            </div>
            <Field label="物件の概要" required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder="広さ・天井高・電源・駐車場・撮影受け入れ実績など"
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "general" && (
          <Field label="ご相談内容" required>
            <textarea
              name="message"
              rows={5}
              required
              placeholder="料金プラン・法人契約・提携のご相談など、なんでもどうぞ。"
              className={`${inputClass} leading-relaxed resize-y`}
            />
          </Field>
        )}

        <div className="border-t border-line pt-5 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label={type === "listing" ? "ご担当者名" : "お名前"} required>
              <input name="name" type="text" placeholder="山田 太郎" required className={inputClass} />
            </Field>
            <Field label="メールアドレス" required>
              <input name="email" type="email" placeholder="info@example.com" required className={inputClass} />
            </Field>
          </div>

          {state?.ok === false && (
            <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3.5 py-2.5">
              {state.error}
            </p>
          )}

          <div className="text-center">
            <button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto bg-accent text-white text-[15px] font-bold px-8 py-3.5 rounded-md hover:bg-accent/85 transition shadow-sm disabled:opacity-50"
            >
              {pending
                ? "送信中…"
                : type === "listing"
                  ? "掲載を依頼する →"
                  : "送信する →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
        {label}
        {required && <span className="text-red-500 text-[11px] ml-1">必須</span>}
        {optional && <span className="text-muted text-[11px] ml-1">任意</span>}
      </span>
      {children}
    </label>
  );
}
