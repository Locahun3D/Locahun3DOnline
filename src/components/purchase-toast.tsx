"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { localizedHref } from "@/lib/i18n/dictionaries";

export default function PurchaseToast() {
  const params = useSearchParams();
  const raw = params.get("purchase");
  const locale = useLocale();
  const en = locale === "en";

  // 初回レンダー時の ?purchase= を一度だけ確定させる。
  // ⚠ 以前は effect の中で setVisible(true) し、種別は ref に入れてレンダー中に
  //   読んでいた。どちらも不正で、React Compiler が
  //   「setState を effect 内で同期呼び出し」「レンダー中に ref を読む」の
  //   2件を検出していた。useState の初期化関数なら「一度だけ捕まえる」という
  //   意図をそのまま表現でき、追加のレンダーも発生しない。
  const [kind] = useState<"success" | "cancel" | null>(() =>
    raw === "success" || raw === "cancel" ? raw : null,
  );
  /** ×ボタンで閉じたか。kind とは別に持つ（kind は初回の事実で不変）。 */
  const [dismissed, setDismissed] = useState(false);

  // 表示が決まった後にURLから ?purchase= を消す（リロードで再表示させない）。
  // これは純粋な副作用なので effect が正しい置き場所。
  useEffect(() => {
    if (!kind) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("purchase");
    window.history.replaceState({}, "", url.toString());
  }, [kind]);

  if (!kind || dismissed) return null;

  const isSuccess = kind === "success";

  return (
    <div
      className={`fixed top-[calc(5rem/var(--z))] left-1/2 -translate-x-1/2 z-50 max-w-[calc(32rem/var(--z))] w-[calc(90vw/var(--z))] border px-5 py-4 shadow-2xl ${
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
          onClick={() => setDismissed(true)}
          className="opacity-50 hover:opacity-100 text-sm transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
