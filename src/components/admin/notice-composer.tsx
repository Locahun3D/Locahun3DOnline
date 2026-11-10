"use client";

import { useActionState, useState } from "react";
import { sendDownloaderNoticeAction, type NoticeState } from "@/lib/notice-actions";

const inputCls =
  "w-full min-h-[40px] bg-neutral-300 text-black border border-line px-3 py-2 text-[13px] focus:outline-none focus:border-accent transition";

/**
 * ダウンロード経験者全員への「お知らせ」（2026-11-11）。
 * 広告の一斉配信（MarketingComposer）とは別。利用条件の改定などの通知だけに使う。
 */
export default function NoticeComposer({
  disabled,
  recipientCount,
  log,
}: {
  disabled: boolean;
  recipientCount: number;
  log: { subject: string; sentAt: string; sent: number; failed: number; total: number }[];
}) {
  const [state, formAction, pending] = useActionState<NoticeState, FormData>(sendDownloaderNoticeAction, undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state !== undefined) setConfirmOpen(false);
  }
  const resumeAt = state?.ok && !state.test && state.nextOffset !== null ? state.nextOffset : 0;

  return (
    <form action={formAction} className="border border-line bg-[#1c1c1c] p-4 space-y-3">
      <input type="hidden" name="offset" value={resumeAt} />
      <div>
        <label htmlFor="notice-subject" className="text-[12px] text-muted mb-1 block">件名</label>
        <input id="notice-subject" name="subject" required maxLength={200} className={inputCls} placeholder="例: 【Locahun 3D】3Dデータ利用条件の改定のお知らせ" />
      </div>
      <div>
        <label htmlFor="notice-body" className="text-[12px] text-muted mb-1 block">本文（プレーンテキスト・空行で段落・URLは自動でリンク）</label>
        <textarea id="notice-body" name="body" required maxLength={20000} rows={8} className={inputCls + " resize-y"} />
      </div>

      <p className="text-[12px] text-muted">
        宛先は3Dデータを入手したことのある有効な会員（{recipientCount.toLocaleString("ja-JP")} 名）。配信の同意がない人にも届くため、
        新商品・値段・キャンペーンなどの宣伝は書かないでください（宣伝は上の一斉配信で）。
      </p>

      {state && !state.ok && (
        <p className="text-[12px] text-red-400 border border-red-400/40 bg-red-400/10 px-3 py-2">{state.error}</p>
      )}
      {state?.ok && (
        <p className={`text-[12px] border px-3 py-2 ${state.error ? "text-red-400 border-red-400/40 bg-red-400/10" : "text-green-400 border-green-400/40 bg-green-400/10"}`}>
          {state.test ? "テスト送信しました（自分宛て）。" : `送信: ${state.sent} 件 / 対象 ${state.total} 件`}
          {state.error && <><br />{state.error} もう一度「送信を実行」すると {resumeAt + 1} 件目から続きを送ります。</>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line">
        <button
          type="submit"
          name="testOnly"
          value="on"
          disabled={disabled || pending}
          className="min-h-[40px] text-[13px] border border-line px-4 hover:border-accent hover:text-accent transition disabled:opacity-30"
        >
          {pending ? "送信中…" : "テスト送信（自分にのみ）"}
        </button>
        {!confirmOpen ? (
          <button
            type="button"
            disabled={disabled || pending}
            onClick={() => setConfirmOpen(true)}
            className="min-h-[40px] text-[13px] border border-accent text-accent px-4 hover:bg-accent hover:text-bg transition disabled:opacity-30"
          >
            {resumeAt > 0 ? `${resumeAt + 1} 件目から続きを送る` : `${recipientCount.toLocaleString("ja-JP")} 名に送る`}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border border-red-400/50 bg-red-400/10 px-3 py-1.5">
            <span className="text-[11px] text-red-300">本当に送りますか？取り消せません（数十秒かかります）。</span>
            <button type="submit" disabled={pending} className="min-h-[40px] text-[12px] bg-red-500 text-white px-3 hover:bg-red-600 transition disabled:opacity-30">
              {pending ? "送信中…" : "送信を実行"}
            </button>
            <button type="button" onClick={() => setConfirmOpen(false)} className="min-h-[40px] text-[12px] text-muted px-2 hover:text-ink transition">
              キャンセル
            </button>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-muted">
          <input type="checkbox" name="allowResend" value="on" /> 同じ件名でも送る
        </label>
      </div>

      {log.length > 0 && (
        <details className="text-[12px] text-muted">
          <summary className="cursor-pointer">送信の記録（{log.length}）</summary>
          <ul className="mt-2 space-y-1">
            {log.map((l, i) => (
              <li key={i}>
                {l.sentAt.slice(0, 16).replace("T", " ")}（UTC） {l.subject} — {l.sent}/{l.total} 件{l.failed > 0 && `（未送信 ${l.failed}）`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </form>
  );
}
