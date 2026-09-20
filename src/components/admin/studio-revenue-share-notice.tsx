"use client";

import { useState, useTransition } from "react";
import { notifyStudioRevenueShareAction } from "@/lib/admin-actions";

/**
 * 掲載データ販売分配規約(20%)を、既に公開済みの直接掲載スタジオへ一括案内する
 * 一時的な運用ボタン。冪等（同じ内容は二重送信しない）なので、押し忘れがあれば
 * 何度でも安全に再実行できる。
 */
export default function StudioRevenueShareNotice() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ notified: number; skipped: number } | null>(null);

  return (
    // 2026-09-20: 説明を1行に短縮し、見出しとボタンを横並びにして高さを抑えた。
    <div className="border border-line bg-[#1c1c1c] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-[280px]">
        <div className="text-[13px] font-bold">分配規約（20%）の案内</div>
        <p className="text-[12px] text-muted">
          公開済みの直接掲載スタジオへアプリ内通知で案内します（送信済みの相手には再送しません）。
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await notifyStudioRevenueShareAction();
            setResult(r);
          })
        }
        className="min-h-[40px] text-[13px] border border-accent/50 text-accent px-4 hover:bg-accent hover:text-bg transition disabled:opacity-40"
      >
        {pending ? "送信中…" : "既存スタジオへ案内を送る"}
      </button>
      {result && (
        <p className="basis-full text-[12px] text-muted">
          送信: {result.notified}件 / 送信済みでスキップ: {result.skipped}件
        </p>
      )}
    </div>
  );
}
