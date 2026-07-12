"use client";

import { useActionState, useEffect, useState } from "react";
import {
  sendMarketingCampaignAction,
  type CampaignState,
} from "@/lib/marketing-actions";

const inputCls =
  "w-full bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] focus:outline-none focus:border-accent transition";

export default function MarketingComposer({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState<CampaignState, FormData>(
    sendMarketingCampaignAction,
    undefined,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 送信完了/失敗後は確認状態をリセットする（誤って連続クリックで再送するのを防ぐ）。
  useEffect(() => {
    if (state !== undefined) setConfirmOpen(false);
  }, [state]);

  return (
    <form action={formAction} className="border border-line bg-[#1c1c1c] p-5 space-y-4">
      <div>
        <label htmlFor="subject" className="mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-1.5 block">
          件名
        </label>
        <input id="subject" name="subject" required maxLength={200} className={inputCls} placeholder="例: 新着ロケ地3件を追加しました" />
      </div>
      <div>
        <label htmlFor="body" className="mono text-[10px] tracking-[0.2em] uppercase opacity-60 mb-1.5 block">
          本文（プレーンテキスト・空行で段落）
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={20000}
          rows={10}
          className={inputCls + " resize-y"}
          placeholder={"いつもロケハン3Dをご利用いただきありがとうございます。\n\n今週、新しいロケ地を3件追加しました。"}
        />
      </div>

      <p className="text-[11px] text-muted leading-[1.7]">
        配信停止リンク・送信者情報（KWI株式会社の名称・住所・連絡先）は
        自動で本文末尾に追加されます。
      </p>

      {state && !state.ok && (
        <p className="text-[12px] text-red-400 border border-red-400/40 bg-red-400/10 px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-[12px] text-green-400 border border-green-400/40 bg-green-400/10 px-3 py-2">
          送信完了: 成功 {state.sent} 件 / 失敗 {state.failed} 件
          {state.skipped > 0 && ` / 上限超過でスキップ ${state.skipped} 件`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line">
        <button
          type="submit"
          name="testOnly"
          value="on"
          disabled={disabled || pending}
          className="mono text-[11px] tracking-[0.18em] uppercase border border-line px-4 py-2 hover:border-accent hover:text-accent transition disabled:opacity-30"
        >
          {pending ? "送信中…" : "テスト送信（自分にのみ）"}
        </button>

        {!confirmOpen ? (
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => setConfirmOpen(true)}
            className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-30"
          >
            会員全員に配信する
          </button>
        ) : (
          <div className="flex items-center gap-2 border border-red-400/50 bg-red-400/10 px-3 py-1.5">
            <span className="text-[11px] text-red-300">本当に配信しますか？取り消せません。</span>
            <button
              type="submit"
              disabled={pending}
              className="mono text-[10px] tracking-[0.16em] uppercase bg-red-500 text-white px-3 py-1.5 hover:bg-red-600 transition disabled:opacity-30"
            >
              {pending ? "送信中…" : "配信を実行"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="mono text-[10px] tracking-[0.16em] uppercase text-muted px-2 py-1.5 hover:text-ink transition"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
