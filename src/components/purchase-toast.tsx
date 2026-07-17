"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { localizedHref } from "@/lib/i18n/dictionaries";

export default function PurchaseToast() {
  const params = useSearchParams();
  const [visible, setVisible] = useState(false);
  const captured = useRef<string | null>(null);
  const raw = params.get("purchase");
  const locale = useLocale();
  const en = locale === "en";

  useEffect(() => {
    if (raw === "success" || raw === "cancel") {
      captured.current = raw;
      setVisible(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("purchase");
      window.history.replaceState({}, "", url.toString());
    }
  }, [raw]);

  if (!visible) return null;

  const isSuccess = captured.current === "success";

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[90vw] border px-5 py-4 shadow-2xl ${
        isSuccess
          ? "bg-[#0a1a0a] border-green-400/40 text-green-300"
          : "bg-[#1a0a0a] border-red-400/40 text-red-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">{isSuccess ? "✓" : "×"}</span>
        <div className="flex-1 space-y-1">
          <div className="font-medium text-sm">
            {isSuccess
              ? en ? "Purchase completed" : "購入が完了しました"
              : en ? "Purchase cancelled" : "購入がキャンセルされました"}
          </div>
          <div className="text-[12px] opacity-70">
            {isSuccess ? (
              en ? (
                <>
                  Download from your{" "}
                  <Link href={localizedHref("/dashboard/purchases", locale)} className="underline hover:text-green-200">
                    purchase history
                  </Link>
                  , where you can also get your receipt.
                </>
              ) : (
                <>
                  ダウンロードは{" "}
                  <Link href="/dashboard/purchases" className="underline hover:text-green-200">
                    購入履歴
                  </Link>{" "}
                  から行えます。領収書もそちらで発行できます。
                </>
              )
            ) : en ? (
              "The purchase was not completed. Please try again."
            ) : (
              "購入は完了していません。改めてお試しください。"
            )}
          </div>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="opacity-50 hover:opacity-100 text-sm transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
