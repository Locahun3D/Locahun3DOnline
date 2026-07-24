"use client";

import { useState, useTransition } from "react";
import { translateMissingEnglishAction } from "@/app/admin/_actions";

/**
 * 英語未翻訳の物件をまとめて自動翻訳する管理者ボタン。
 * Claude 呼び出しのため数秒〜かかる。実行中はスピナー、完了後に件数を表示。
 */
export default function TranslateMissingButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await translateMissingEnglishAction();
        if (r.failed > 0) {
          setMsg(`${r.translated}件を翻訳しました（${r.failed}件は翻訳できず未対応のまま）`);
        } else if (r.translated > 0) {
          setMsg(`${r.translated}件を英語に翻訳しました`);
        } else {
          setMsg("未翻訳の物件はありませんでした");
        }
      } catch {
        setMsg("翻訳に失敗しました。時間をおいて再度お試しください。");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink hover:border-accent hover:text-accent transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        title="英語(EN欄)が空の物件を自動翻訳でまとめて埋めます。手動で埋めた英語は上書きしません。"
      >
        {pending ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            翻訳中…
          </>
        ) : (
          <>🌐 英語を自動翻訳</>
        )}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
