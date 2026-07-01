"use client";

import { useState } from "react";
import InquiryForm from "@/components/inquiry-form";

/**
 * サイドの「お問い合わせ」パネル内で、ボタンを押すとフォームをその場で展開する。
 * 以前は別の大きなセクションへスクロールしていたが、パネル内に統合した。
 */
export default function InquiryPanel({
  propertyId,
  propertyTitle,
  locale = "ja",
}: {
  propertyId: string;
  propertyTitle: string;
  locale?: "ja" | "en";
}) {
  const [open, setOpen] = useState(false);
  const en = locale === "en";

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full bg-ink text-white text-center text-[14px] font-bold py-3.5 rounded-md hover:bg-ink/85 transition"
      >
        {open
          ? en ? "Close form ✕" : "フォームを閉じる ✕"
          : en ? "Inquire via form" : "フォームからお問い合わせ"}
      </button>

      {open && (
        <div className="mt-3 -mx-5 border-t border-line">
          <InquiryForm propertyId={propertyId} propertyTitle={propertyTitle} />
        </div>
      )}
    </div>
  );
}
