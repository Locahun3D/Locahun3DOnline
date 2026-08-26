"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitContactRequestAction, type ContactState } from "@/lib/contact-actions";
import type { ContactType } from "@/lib/contact-requests";
import { useLocale } from "@/components/locale-provider";

const HONEYPOT_FIELD = "website";
const RENDERED_AT_FIELD = "_rt";


const inputClass =
  "w-full border border-line rounded-md px-3.5 py-2.5 text-[14px] focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition";


/**
 * /contact/[type] の各専用ページで使う共通フォーム。type ごとに項目を出し分ける
 * （デザイン案 Pattern 7 の承認済みフィールド構成をそのまま実装）。
 */
/** エディターの「公開を申請」から来たときに埋める初期値。物件データが正。 */
export type ContactPrefill = {
  propertyId?: string;
  company?: string;
  propertyName?: string;
  address?: string;
  /** 公開されたときのURL。申請内容に含めて当事者間で事前に確認する。 */
  publicUrl?: string;
};

export default function ContactForm({
  type,
  prefill,
  estimateSummary,
}: {
  type: ContactType;
  prefill?: ContactPrefill;
  /** scan（制作側スキャン依頼）専用。概算シミュレーターの選択内容。
   *  ⚠ ここには**入れずに** hidden で送り、サーバー側で本文の先頭へ足す。
   *  本文欄へ直接書き込むと、利用者が書いた文章と混ざるうえ、書いた後に
   *  シミュレーターを触られると古い内容が本文に残る（＝嘘の申告になる）。 */
  estimateSummary?: string;
}) {
  const en = useLocale() === "en";
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    submitContactRequestAction,
    undefined,
  );
  const renderedAtRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  /** 返信が前提の窓口（担当者名・メール必須）。サーバー側の検証と対。 */
  const needsReply = type === "listing" || type === "scan";

  // ⚠ ボット判定用のレンダー時刻。これが無いと送信が「速すぎる」扱いで
  //    弾かれ得るので、フォームの種別に関係なく必ず入れる。
  //    （バグ報告専用コードを撤去した際に一度巻き添えで消した — 2026-07-29）
  useEffect(() => {
    if (renderedAtRef.current) renderedAtRef.current.value = String(Date.now());
  }, [type]);


  if (state?.ok) {
    // フォームは匿名送信を許可しているため、メール未入力なら「返信を待つ」
    // 案内は出さない。
    // ⚠ 以前は emailRef.current を読んで判定していたが、**レンダー中にrefを
    //   読むのは不正**（コミット前の値を見る可能性がある）。実際に受け取った
    //   サーバーアクションが hasEmail を返す形に変更した。
    const hasEmail = state.hasEmail;
    return (
      <div className="bg-white border border-line px-8 py-11 text-center">
        <div className="text-accent text-3xl mb-3">✓</div>
        <h3 className="text-[16px] font-bold text-ink mb-2">
          {en ? "Your message has been sent" : "お問い合わせを送信しました"}
        </h3>
        <p className="text-[12.5px] text-muted leading-relaxed">
          {hasEmail ? (
            en ? (
              <>
                We will get back to you shortly.
                <br />
                Please look out for a reply at the email address you provided.
              </>
            ) : (
              <>
                担当者より折り返しご連絡いたします。
                <br />
                ご記入のメールアドレス宛の返信をお待ちください。
              </>
            )
          ) : en ? (
            <>
              We will review your message.
              <br />
              No contact details were provided — if you need a reply, please include an email address.
            </>
          ) : (
            <>
              内容を確認いたします。
              <br />
              連絡先が未記入のため、返信が必要な場合はメールアドレスもご記入ください。
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line px-7 py-8 sm:px-8">
      <input type="hidden" name="type" value={type} />
      {/* 物件ひも付け。送信時にサーバー側で所有者検証のうえ公開申請を確定させる。 */}
      {prefill?.propertyId && (
        <input type="hidden" name="propertyId" value={prefill.propertyId} />
      )}
      <input type="hidden" name={RENDERED_AT_FIELD} ref={renderedAtRef} defaultValue="" />
      {/* 概算の選択内容。サーバー側で本文の先頭に付けて保存・転送する。 */}
      {type === "scan" && estimateSummary && (
        <input type="hidden" name="estimate" value={estimateSummary} />
      )}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className="space-y-5">

        {type === "request" && (
          <>
            <Field en={en} label={en ? "Preferred area / property type" : "希望エリアや物件"} required>
              <input name="area" type="text" placeholder={en ? "e.g. around Setagaya, Tokyo / warehouse, traditional house" : "例: 東京都 世田谷区 周辺 / 倉庫・古民家など"} className={inputClass} />
            </Field>
            <Field en={en} label={en ? "Intended use & requirements" : "撮影の用途・ほしい条件"} required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={en ? "e.g. Looking for an abandoned-factory-style location for a music video. Ideally 4m+ ceilings with a load-in route." : "例: MV撮影で使える廃工場系のロケ地を探しています。天井高4m以上・搬入経路があると理想です。"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "listing" && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Field en={en} label={en ? "Company / owner name" : "会社名・オーナー名"} required>
                <input name="company" type="text" defaultValue={prefill?.company ?? ""} placeholder={en ? "Acme Inc." : "株式会社〇〇"} className={inputClass} />
              </Field>
              <Field en={en} label={en ? "Property name" : "物件名"} required>
                <input name="propertyName" type="text" defaultValue={prefill?.propertyName ?? ""} placeholder={en ? "e.g. Studio XYZ" : "例: 〇〇スタジオ"} className={inputClass} />
              </Field>
              {/* ⚠ 公開URLは申請内容に含める。物件IDがそのままURL（かつR2キー）になり、
                  公開後の変更は renamePropertyAction 経由でしかできない。申請の時点で
                  スタジオと運営が同じ文字列を見て確認できるようにしておく。
                  編集はエディターの「URLを編集」で行うため、ここは読み取り専用。 */}
              <Field en={en} label={en ? "Public URL" : "公開URL"} note={en ? "edit in the listing editor" : "変更はエディターの「URLを編集」から"}>
                <input
                  name="publicUrl"
                  type="text"
                  readOnly
                  defaultValue={prefill?.publicUrl ?? ""}
                  className={`${inputClass} bg-[#f6f8fa] text-muted cursor-not-allowed`}
                />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field en={en} label={en ? "Address" : "所在地"} required>
                <input name="address" type="text" defaultValue={prefill?.address ?? ""} placeholder={en ? "e.g. Shibuya, Tokyo…" : "例: 東京都渋谷区…"} className={inputClass} />
              </Field>
              <Field en={en} label={en ? "Phone" : "電話番号"} optional>
                <input name="phone" type="tel" placeholder="03-0000-0000" className={inputClass} />
              </Field>
            </div>
            <Field en={en} label={en ? "Preferred listing / scan dates" : "掲載・スキャン希望日について"} required>
              <textarea
                name="message"
                rows={4}
                required
                placeholder={en ? "e.g. We'd like to be listed ASAP. Weekday mornings after the 10th work best for a scan visit." : "例: できるだけ早く掲載したい。スキャンは○月○日以降の平日午前が対応しやすいです。"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {/* 「ご相談」窓口は廃止したため専用欄も撤去（2026-07-30）。 */}

        {type === "scan" && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Field en={en} label={en ? "Company" : "会社名・屋号"} optional>
                <input name="company" type="text" placeholder={en ? "Acme Inc." : "株式会社〇〇"} className={inputClass} />
              </Field>
              <Field en={en} label={en ? "Phone" : "電話番号"} optional>
                <input name="phone" type="tel" placeholder="03-0000-0000" className={inputClass} />
              </Field>
            </div>
            <Field
              en={en}
              label={en ? "Location / facility to scan" : "スキャン対象のロケ地・施設"}
              optional
            >
              <input
                name="area"
                type="text"
                placeholder={en ? "e.g. a warehouse in Kawasaki, Kanagawa" : "例: 神奈川県川崎市の倉庫"}
                className={inputClass}
              />
            </Field>
            <Field
              en={en}
              label={en ? "Details of your request" : "ご依頼の内容"}
              required
              note={en ? "intended use, schedule, anything to note" : "撮影の用途・スケジュール・注意事項など"}
            >
              <textarea
                name="message"
                rows={5}
                required
                placeholder={
                  en
                    ? "e.g. We're scouting for a TV commercial and would like the interior and the front yard scanned."
                    : "例: CM撮影のロケハン用に、屋内と前庭をスキャンしてほしいです。"
                }
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {type === "license" && (
          <>
            <Field en={en} label={en ? "Company (optional)" : "会社名・屋号（任意）"}>
              <input name="company" type="text" placeholder={en ? "Acme Inc." : "株式会社〇〇"} className={inputClass} />
            </Field>
            <Field
              en={en}
              label={en ? "What would you like to do?" : "ご希望の内容"}
              required
              note={en ? "redistribution, AI training, API / data partnership, etc." : "再配布・AI学習利用・API/データ連携など"}
            >
              <textarea
                name="message"
                rows={5}
                required
                placeholder={en
                  ? "e.g. We'd like to use purchased data as part of an AI training set for a VR platform. Please let us know what's possible."
                  : "例: 購入データをVRプラットフォーム向けのAI学習データとして使いたいです。可能な範囲を教えてください。"}
                className={`${inputClass} leading-relaxed resize-y`}
              />
            </Field>
          </>
        )}

        {/* ⚠ 連絡先の要否は type ごとに変える。掲載依頼(listing)とスキャン依頼(scan)は
            こちらから見積・日程を返す前提なので担当者名とメールを必須にする
            （サーバー側 contact-actions の requiredContactSchema と対にすること）。 */}
        <div className="border-t border-line pt-5 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Field
              en={en}
              label={
                type === "listing" || type === "scan"
                  ? en
                    ? "Contact person"
                    : "ご担当者名"
                  : en
                    ? "Name"
                    : "お名前"
              }
              required={needsReply}
              optional={!needsReply}
            >
              <input
                name="name"
                type="text"
                placeholder={en ? "Jane Smith" : "山田 太郎"}
                required={needsReply}
                className={inputClass}
              />
            </Field>
            <Field en={en} label={en ? "Email" : "メールアドレス"} required={needsReply} optional={!needsReply}>
              <input
                name="email"
                type="email"
                placeholder="info@example.com"
                required={needsReply}
                ref={emailRef}
                className={inputClass}
              />
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
                ? en ? "Sending…" : "送信中…"
                : type === "listing"
                  ? prefill?.propertyId
                    ? en ? "Submit publication request →" : "この内容で公開を申請する →"
                    : en ? "Request a listing →" : "掲載を依頼する →"
                  : type === "scan"
                    ? en ? "Request a quote with these settings →" : "この内容で見積を依頼する →"
                    : en ? "Send →" : "送信する →"}
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
  note,
  en,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  note?: string;
  en?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink/70 mb-1.5 block">
        {label}
        {required && <span className="text-red-500 text-[11px] ml-1">{en ? "required" : "必須"}</span>}
        {optional && <span className="text-muted text-[11px] ml-1">{en ? "optional" : "任意"}</span>}
        {note && <span className="text-muted text-[11px] ml-1.5">（{note}）</span>}
      </span>
      {children}
    </label>
  );
}
