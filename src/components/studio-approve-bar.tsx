"use client";

import { useState, useTransition } from "react";
import { studioApproveAction } from "@/app/preview/[token]/_actions";

/**
 * 限定プレビューの最上部に出す、スタジオ用の承認バー（2026-09-21）。
 * 確認メールのリンク（?approve=キー）から開いたときだけ表示される。
 * 押し間違いで公開されないよう、2段階（ボタン → 確認）にしてある。
 */
export default function StudioApproveBar({
  token,
  approveKey,
  en,
  publishedId,
}: {
  token: string;
  approveKey: string;
  en: boolean;
  /** すでにスタジオの承認で公開済みのとき（お礼の表示だけ出す）。 */
  publishedId?: string;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "done" | "held">(publishedId ? "done" : "idle");
  const [error, setError] = useState("");
  const [propertyId, setPropertyId] = useState(publishedId ?? "");
  const [pending, start] = useTransition();

  const approve = () =>
    start(async () => {
      setError("");
      const result = await studioApproveAction(token, approveKey);
      if (!result.ok) {
        setError(result.error);
        setStep("idle");
        return;
      }
      setPropertyId(result.propertyId);
      setStep(result.published ? "done" : "held");
    });

  const box =
    "frame mb-0 border border-accent/60 bg-[#1d1608] px-4 py-4 text-[14px] text-[#ffe2b3] flex flex-wrap items-center justify-between gap-x-6 gap-y-3";
  const primary =
    "min-h-[44px] px-5 bg-accent text-black font-bold text-[14px] tracking-[0.04em] disabled:opacity-50";
  const ghost = "min-h-[44px] px-4 border border-[#ffe2b3]/40 text-[13px] disabled:opacity-50";

  if (step === "done" || publishedId) {
    return (
      <div className={box} role="status" data-studio-approve="done">
        <span>
          {en ? "Thank you. The page is now public." : "ありがとうございます。掲載ページを公開しました。"}
        </span>
        <a className={ghost + " inline-flex items-center"} href={`${en ? "/en" : ""}/properties/${publishedId || propertyId}`}>
          {en ? "Open the public page →" : "公開ページを開く →"}
        </a>
      </div>
    );
  }
  if (step === "held") {
    return (
      <div className={box} role="status" data-studio-approve="held">
        <span className="whitespace-pre-line">
          {en
            ? "Thank you. Your approval has been recorded. We will finish the remaining items and publish the page."
            : `ありがとうございます。ご承認を記録しました。
残りの項目を運営で仕上げてから公開いたします。`}
        </span>
      </div>
    );
  }
  return (
    <div className={box} data-studio-approve={step}>
      <span className="leading-[1.8] whitespace-pre-line">
        {step === "confirm"
          ? en
            ? "Publish this page now? Its content, prices and photos will be visible to everyone."
            : `この内容で公開します。よろしいですか？
掲載内容・料金・写真が、だれでも見られる状態になります。`
          : en
            ? "Please check the content, prices, photos and facilities below. If everything is correct, approve it here."
            : `掲載内容・料金・写真・設備をご確認ください。
問題がなければ、ここから公開できます。`}
        {error && <strong className="block text-[#ff9a8a] mt-1">{error}</strong>}
      </span>
      <span className="flex flex-wrap gap-2">
        {step === "confirm" ? (
          <>
            <button type="button" className={ghost} disabled={pending} onClick={() => setStep("idle")}>
              {en ? "Back" : "戻る"}
            </button>
            <button type="button" className={primary} disabled={pending} onClick={approve}>
              {pending ? (en ? "Publishing…" : "公開しています…") : en ? "Yes, publish" : "はい、公開する"}
            </button>
          </>
        ) : (
          <button type="button" className={primary} onClick={() => setStep("confirm")}>
            {en ? "Approve and publish" : "この内容でOK・公開する"}
          </button>
        )}
      </span>
    </div>
  );
}
