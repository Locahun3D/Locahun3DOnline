"use client";

import { useActionState, useState } from "react";
import { fmtDateOnlyJST } from "@/lib/date-format";
import {
  createGiftCodeAction,
  setGiftCodeStatusAction,
  deleteGiftCodeAction,
  type CreateGiftState,
} from "@/lib/gift-actions";
import {
  GIFT_BUCKETS,
  GIFT_BUCKET_LABEL,
  type GiftCode,
} from "@/lib/gift-schema";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="min-h-[40px] text-[12px] border border-line px-3 hover:border-accent hover:text-accent transition"
    >
      {copied ? "✓ コピー" : "コピー"}
    </button>
  );
}

const inputCls =
  "min-h-[40px] bg-neutral-300 text-black border border-line px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-accent transition";

export default function GiftCodeAdmin({ codes }: { codes: GiftCode[] }) {
  const [state, formAction, pending] = useActionState<CreateGiftState, FormData>(
    createGiftCodeAction,
    undefined,
  );

  return (
    // 2026-09-20: 余白を詰め、ラベルの等幅大文字装飾をやめて読みやすい 12px に。ボタン・入力は iPad 用に高さ 40px。
    <div className="space-y-5">
      {/* Create */}
      <section className="border border-line bg-[#1c1c1c] p-4">
        <div className="text-[13px] font-bold mb-3">コードを発行</div>
        <form action={formAction} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              トークン数
            </span>
            <input
              name="tokens"
              type="number"
              min={1}
              defaultValue={10}
              required
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              トークンの種類
            </span>
            <select name="bucket" defaultValue="bonus" className={inputCls}>
              {GIFT_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {GIFT_BUCKET_LABEL[b]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              使用上限（人数）
            </span>
            <input
              name="maxUses"
              type="number"
              min={1}
              defaultValue={1}
              required
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              有効期限（任意）
            </span>
            <input name="expiresAt" type="date" className={inputCls} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              対象: アカウント作成日（以降・任意）
            </span>
            <input name="accountCreatedFrom" type="date" className={inputCls} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">
              対象: アカウント作成日（まで・任意）
            </span>
            <input name="accountCreatedTo" type="date" className={inputCls} />
          </label>

          <p className="text-[12px] text-muted sm:col-span-2 lg:col-span-4 -mt-1.5">
            作成日を指定すると、その期間に登録した人だけが引き換えられます。空欄なら誰でも引き換えられます。
          </p>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-[12px] text-muted">
              メモ（任意・用途など）
            </span>
            <input
              name="note"
              type="text"
              maxLength={200}
              placeholder="例: 登壇イベント配布 / ○○様への贈呈"
              className={inputCls}
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="w-full min-h-[40px] text-[13px] border border-accent text-accent px-4 hover:bg-accent hover:text-bg transition disabled:opacity-50"
            >
              {pending ? "発行中…" : "＋ 発行する"}
            </button>
          </div>
        </form>

        {state?.ok === false && (
          <p className="mt-3 text-[12px] text-red-400">{state.error}</p>
        )}
        {state?.ok === true && (
          <div className="mt-4 border border-accent/40 bg-accent/10 px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-[13px]">発行しました:</span>
            <code className="mono text-base text-accent tracking-[0.1em]">
              {state.code.code}
            </code>
            <CopyButton value={state.code.code} />
            <span className="mono text-[11px] text-muted">
              {state.code.tokens} トークン / {GIFT_BUCKET_LABEL[state.code.bucket]} / 上限{" "}
              {state.code.maxUses} 人
            </span>
          </div>
        )}
      </section>

      {/* List */}
      <section>
        <div className="text-[13px] font-bold mb-2">発行済みコード（{codes.length}）</div>
        {codes.length === 0 ? (
          <p className="text-[13px] text-muted border border-line px-4 py-3">発行済みのコードはありません。</p>
        ) : (
          <div className="space-y-2">
            {codes.map((c) => {
              const expired = !!c.expiresAt && c.expiresAt < new Date().toISOString();
              const exhausted = c.uses >= c.maxUses;
              const live = c.status === "active" && !expired && !exhausted;
              return (
                <div
                  key={c.code}
                  className="border border-line bg-[#1a1a1a] px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-2"
                >
                  <div className="flex items-center gap-2 min-w-[210px]">
                    <code
                      className={`mono text-[15px] tracking-[0.08em] ${
                        live ? "text-accent" : "text-muted line-through"
                      }`}
                    >
                      {c.code}
                    </code>
                    <CopyButton value={c.code} />
                  </div>

                  <div className="text-[12px]">
                    <span className="text-ink">{c.tokens}</span>{" "}
                    <span className="text-muted">トークン</span>
                    <span className="mono text-[10px] text-muted ml-2 border border-line px-1.5 py-0.5">
                      {GIFT_BUCKET_LABEL[c.bucket]}
                    </span>
                  </div>

                  <div className="mono text-[11px] text-muted">
                    使用 {c.uses}/{c.maxUses}
                  </div>

                  <div className="mono text-[11px] text-muted">
                    {c.expiresAt ? `〜${fmtDateOnlyJST(c.expiresAt)}` : "無期限"}
                  </div>

                  {(c.accountCreatedFrom || c.accountCreatedTo) && (
                    <div className="mono text-[10px] text-accent border border-accent/30 px-1.5 py-0.5">
                      登録 {c.accountCreatedFrom ?? "…"} 〜 {c.accountCreatedTo ?? "…"} 限定
                    </div>
                  )}

                  <div>
                    {!live ? (
                      <span className="mono text-[10px] tracking-[0.18em] uppercase border border-amber-400/40 text-amber-400 px-1.5 py-0.5">
                        {c.status === "disabled"
                          ? "無効"
                          : expired
                            ? "期限切れ"
                            : "上限到達"}
                      </span>
                    ) : (
                      <span className="mono text-[10px] tracking-[0.18em] uppercase border border-green-400/40 text-green-400 px-1.5 py-0.5">
                        有効
                      </span>
                    )}
                  </div>

                  {c.note && (
                    <div className="text-[11px] text-muted truncate max-w-[220px]" title={c.note}>
                      {c.note}
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-auto">
                    <form action={setGiftCodeStatusAction}>
                      <input type="hidden" name="code" value={c.code} />
                      <input
                        type="hidden"
                        name="status"
                        value={c.status === "active" ? "disabled" : "active"}
                      />
                      <button className="min-h-[40px] text-[12px] border border-line px-3 hover:border-ink transition">
                        {c.status === "active" ? "無効化" : "有効化"}
                      </button>
                    </form>
                    <form
                      action={deleteGiftCodeAction}
                      onSubmit={(e) => {
                        if (!confirm(`${c.code} を削除しますか？`)) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="code" value={c.code} />
                      <button className="min-h-[40px] text-[12px] border border-red-500/40 text-red-400 px-3 hover:bg-red-500/10 transition">
                        削除
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
