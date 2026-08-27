"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitContactRequestAction, type ContactState } from "@/lib/contact-actions";

const HONEYPOT_FIELD = "website";
const RENDERED_AT_FIELD = "_rt";

/**
 * データ販売パネルからその場で送る「このデータの使い方」問い合わせ。
 *
 * ── なぜ専用フォームなのか ──────────────────────────────────
 * ライセンスの可否表を見て「自分の用途で使えるのか」と迷った瞬間が、質問の
 * 意思が最も高い地点。/contact/license へ飛ばすと、どの物件のどのデータの話
 * だったのかを本人が書き直す必要があり、運営側も特定できなかった。
 * ここで開けば **物件・データ・選択中のライセンスが確定した状態** で送れる。
 *
 * ⚠ 送信経路は新設しない。既存の一般お問い合わせ（contact-actions の
 *   submitContactRequestAction / type="license"）にそのまま乗せる。保存先は
 *   contact_requests、運営へのメール転送・管理者通知も既存のまま動く。
 *   管理画面（/admin/contact-requests）は propertyName＝「物件名」、
 *   url＝「対象URL」、publicUrl＝「公開URL」を既に表示するので、
 *   admin 側に手を入れなくても「どの物件のどのデータか」が残る。
 *   ライセンス区分だけは対応する欄が無いため本文の先頭に1行で入れる。
 */
export default function DataInquiry({
  propertyId,
  propertyTitle,
  itemLabel,
  licenseLabel,
  en,
}: {
  propertyId: string;
  propertyTitle: string;
  itemLabel: string;
  /** 選択中のライセンス区分の表示名。切り替えるとこの表示も追従する。 */
  licenseLabel: string;
  en: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitContactRequestAction,
    undefined,
  );
  const renderedAtRef = useRef<HTMLInputElement>(null);
  const pageUrlRef = useRef<HTMLInputElement>(null);

  // 時間ガード（MIN_FILL_MS）用の打刻と、管理画面に残す「対象URL」。
  // ⚠ どちらも state ではなく hidden input へ直接書く。state にすると
  //   effect 内 setState でカスケードレンダーになり lint が落ちる。
  useEffect(() => {
    if (renderedAtRef.current) renderedAtRef.current.value = String(Date.now());
    if (pageUrlRef.current) pageUrlRef.current.value = window.location.href;
  }, [open]);

  // 管理画面の「物件名」列に、どのデータの話かまで入れる（schema 上限 120 字）。
  const subject = `${propertyTitle}${itemLabel ? `／${itemLabel}` : ""}`.slice(0, 120);
  // ライセンス区分に対応する保存欄が無いため、物件名の末尾に括弧書きで載せる
  // （本文を書き換えると利用者が書いた文章と運営の付加情報が混ざるため）。
  const adminSubject = `${subject}（${licenseLabel}）`.slice(0, 120);

  // ⚠ 入力欄は必ず「白背景＋暗色文字」を明示すること。
  //   ・物件詳細は .theme-online（明るいテーマ）で、globals.css が
  //     input/textarea に color:#1a1f25 を当てる → 暗い背景だと文字が消える。
  //   ・逆に暗色テーマでは preflight の color:inherit で白文字になり、
  //     白背景だと今度は白на白になる。両方に効くのは色を固定する書き方だけ。
  const inputClass =
    "w-full bg-white border border-line px-2.5 py-1.5 text-[12px] text-[#14181c] placeholder:text-[#9aa5af] focus:border-accent outline-none transition";

  return (
    <div className="w-full basis-full mt-1.5 border-t border-line/40 pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mono text-[10px] max-[720px]:text-[11px] tracking-[0.14em] uppercase text-accent/80 hover:text-accent max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
        >
          {en
            ? "▸ Ask about this data's usage rights"
            : "▸ このデータの使い方を問い合わせる"}
        </button>
      ) : state?.ok ? (
        <div className="py-2">
          <div className="text-[12px] text-accent mb-1">
            ✓ {en ? "Your question has been sent" : "お問い合わせを送信しました"}
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            {state.hasEmail
              ? en
                ? "We'll reply to the address you gave us."
                : "ご記入のメールアドレス宛に折り返しご連絡いたします。"
              : en
                ? "No address was given, so we can't reply — add one if you need an answer."
                : "連絡先が未記入のため返信できません。回答が必要な場合はメールアドレスをご記入ください。"}
          </p>
        </div>
      ) : (
        <form action={formAction} className="py-1">
          {/* ── 送信内容の固定部分。すべてサーバー側で再解釈される値のみ ── */}
          <input type="hidden" name="type" value="license" />
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="propertyName" value={adminSubject} />
          <input type="hidden" name="url" ref={pageUrlRef} defaultValue="" />
          <input type="hidden" name={RENDERED_AT_FIELD} ref={renderedAtRef} defaultValue="" />
          <div
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
          >
            <label>
              Website
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          {/* 何について聞いているかを、送信前に本人にも見せる。 */}
          <div className="border border-accent/30 bg-accent/5 px-3 py-2 mb-2.5">
            <div className="mono text-[9px] tracking-[0.18em] uppercase text-accent/70 mb-1">
              {en ? "Asking about" : "お問い合わせ対象"}
            </div>
            <div className="text-[12px] text-ink leading-snug">{subject}</div>
            <div className="mono text-[10px] text-muted mt-0.5">
              {en ? "License: " : "ライセンス: "}
              {licenseLabel}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-2 mb-2">
            <label className="block">
              <span className="mono text-[9px] tracking-[0.14em] uppercase text-muted">
                {en ? "Name" : "お名前"}
              </span>
              <input name="name" type="text" className={inputClass} placeholder={en ? "Jane Smith" : "山田 太郎"} />
            </label>
            <label className="block">
              <span className="mono text-[9px] tracking-[0.14em] uppercase text-muted">
                {en ? "Company" : "会社名"}
              </span>
              <input name="company" type="text" className={inputClass} placeholder={en ? "Acme Inc." : "株式会社〇〇"} />
            </label>
            <label className="block">
              <span className="mono text-[9px] tracking-[0.14em] uppercase text-accent/80">
                {en ? "Email (for a reply)" : "メール（返信先）"}
              </span>
              <input name="email" type="email" className={inputClass} placeholder="info@example.com" />
            </label>
          </div>

          <label className="block mb-2">
            <span className="mono text-[9px] tracking-[0.14em] uppercase text-muted">
              {en ? "How do you want to use it?" : "使いたい用途・ご質問"}
            </span>
            <textarea
              name="message"
              rows={3}
              required
              className={`${inputClass} leading-relaxed resize-y`}
              placeholder={
                en
                  ? "e.g. Can we publish this as a VRChat world? It would be free to enter."
                  : "例: このデータをVRChatワールドとして公開したいのですが可能でしょうか。入場は無料の予定です。"
              }
            />
          </label>

          {state?.ok === false && (
            <p className="text-[11px] text-red-400 mb-2">{state.error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-1.5 mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-40"
            >
              {pending ? (en ? "Sending…" : "送信中…") : en ? "Send →" : "送信する →"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mono text-[10px] tracking-[0.16em] uppercase text-muted hover:text-ink transition"
            >
              {en ? "Cancel" : "閉じる"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
