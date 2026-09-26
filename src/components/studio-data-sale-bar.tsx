"use client";

import { useState, useTransition } from "react";
import { studioDataSaleAction } from "@/app/preview/[token]/_actions";
import { DATA_SALE_STATUS_LABEL, REVENUE_SHARE_PERCENT, type DataSaleStatus } from "@/lib/data-sale-consent";

/**
 * 3Dデータ販売の許諾をスタジオから受ける回答欄（2026-09-26 本人指示）。
 * 確認メールの「許諾する／販売しない」リンク（?approve=キー&sale=yes|no#data-sale）から開く。
 *
 * 掲載の承認バーとは別にしてある。掲載はOKだが販売はNG、という返事を取りこぼさないため。
 * リンクの選択は**初期選択**にするだけで、押さないと記録されない（誤クリックで許諾しない）。
 */
export default function StudioDataSaleBar({
  token,
  approveKey,
  en,
  initialChoice,
  status,
  price,
  savedNote,
}: {
  token: string;
  approveKey: string;
  en: boolean;
  /** メールのリンクに入っていた選択（yes/no）。無ければ未選択。 */
  initialChoice?: "granted" | "declined";
  status: DataSaleStatus;
  /** 提示している販売価格（税込・円）。0 なら金額は書かない。 */
  price: number;
  savedNote: string;
}) {
  const answered = status === "granted" || status === "declined";
  const [choice, setChoice] = useState<"granted" | "declined" | "">(
    initialChoice ?? (answered ? status : ""),
  );
  const [note, setNote] = useState(savedNote);
  const [done, setDone] = useState<"granted" | "declined" | "">(answered ? status : "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (choice !== "granted" && choice !== "declined") return;
      setError("");
      const result = await studioDataSaleAction(token, approveKey, choice, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(result.answer);
    });

  const yen = `¥${price.toLocaleString("ja-JP")}`;
  const box = "frame border border-line bg-[#151515] px-4 py-4 text-[14px] text-ink";
  const label = "flex items-start gap-2 leading-[1.8] cursor-pointer";
  const primary =
    "min-h-[44px] px-5 bg-accent text-black font-bold text-[14px] tracking-[0.04em] disabled:opacity-50";

  if (done) {
    return (
      <div id="data-sale" className={box} role="status" data-data-sale="done">
        <p className="leading-[1.9]">
          {en
            ? done === "granted"
              ? "Thank you. We have recorded your permission to sell the 3D data."
              : "Thank you. We have recorded that the 3D data will not be sold."
            : done === "granted"
              ? "ありがとうございます。3Dデータ販売のご許諾を記録しました。"
              : "承知しました。3Dデータは販売しない、として記録しました。"}
          <br />
          {en
            ? "You can change this at any time by replying to our email."
            : "ご変更はいつでも、確認メールへの返信でお知らせください。"}
        </p>
      </div>
    );
  }

  return (
    <div id="data-sale" className={box} data-data-sale="ask">
      <div className="mono text-[11px] tracking-[0.2em] uppercase text-muted mb-2">Data sale</div>
      <p className="leading-[1.9] mb-3">
        {en ? (
          <>
            May we sell the 3D data (PLY/OBJ) of this space to filmmakers?
            <br />
            {price > 0 ? `Planned price: ${yen} (incl. tax).` : "The price will be agreed with you afterwards."}
            <br />
            {REVENUE_SHARE_PERCENT}% of each sale goes to your studio.
          </>
        ) : (
          <>
            この空間の3Dデータ（PLY・OBJ）を、映像制作者向けに販売してよろしいでしょうか。
            <br />
            {price > 0 ? `販売価格は ${yen}（税込）を予定しています。` : "販売価格は、ご許諾のあとに改めてご相談します。"}
            <br />
            売上の {REVENUE_SHARE_PERCENT}% を貴スタジオへ分配します（掲載データ販売分配規約 第2条）。
            <br />
            販売しない場合でも、掲載ページと3Dツアーはそのままご利用いただけます。
          </>
        )}
      </p>
      <div className="flex flex-col gap-2 mb-3">
        <label className={label}>
          <input
            type="radio"
            name="data-sale-choice"
            className="mt-[6px]"
            checked={choice === "granted"}
            onChange={() => setChoice("granted")}
          />
          <span>{en ? "Yes, you may sell the 3D data" : "3Dデータの販売を許諾する"}</span>
        </label>
        <label className={label}>
          <input
            type="radio"
            name="data-sale-choice"
            className="mt-[6px]"
            checked={choice === "declined"}
            onChange={() => setChoice("declined")}
          />
          <span>{en ? "No, please do not sell it for now" : "今回は販売しない"}</span>
        </label>
      </div>
      <label className="block text-[13px] text-muted mb-1" htmlFor="data-sale-note">
        {en ? "Conditions or requests (optional)" : "条件・ご希望（任意）"}
      </label>
      <textarea
        id="data-sale-note"
        value={note}
        maxLength={400}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        className="w-full bg-[#0f0f0f] border border-line px-3 py-2 text-[14px] leading-[1.8] mb-3"
        placeholder={en ? "e.g. price, credit, period" : "例: 希望価格、クレジット表記、期間 など"}
      />
      {error && <p className="text-[13px] text-[#ff9a8a] mb-2">{error}</p>}
      <button type="button" className={primary} disabled={pending || !choice} onClick={submit}>
        {pending ? (en ? "Sending…" : "送信しています…") : en ? "Send this answer" : "この内容で回答する"}
      </button>
      <p className="text-[12px] text-muted mt-2 leading-[1.8]">
        {en
          ? `Current status: ${DATA_SALE_STATUS_LABEL[status]}`
          : `現在の状態: ${DATA_SALE_STATUS_LABEL[status]}`}
      </p>
    </div>
  );
}
