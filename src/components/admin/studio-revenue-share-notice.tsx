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
    <div className="border border-line bg-[#1c1c1c] px-5 py-4">
      <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">
        掲載データ販売分配規約（20%）の案内
      </div>
      <p className="text-[11px] text-muted mb-3 leading-[1.7] max-w-[60ch]">
        既に公開済みの直接掲載スタジオへ、新設した分配規約をアプリ内通知で案内します。
        送信済みのユーザーには再送しません（何度押しても安全）。
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await notifyStudioRevenueShareAction();
            setResult(r);
          })
        }
        className="mono text-[10px] tracking-[0.2em] uppercase border border-accent/50 text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-40"
      >
        {pending ? "送信中…" : "既存スタジオへ案内を送る"}
      </button>
      {result && (
        <p className="mt-2 text-[11px] text-muted">
          送信: {result.notified}件 / 送信済みでスキップ: {result.skipped}件
        </p>
      )}
    </div>
  );
}
