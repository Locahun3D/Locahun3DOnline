"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createPropertyEmbedAction,
  getPropertyEmbedAction,
  setPropertyEmbedEnabledAction,
  revokePropertyEmbedAction,
} from "@/app/admin/properties/embed-actions";
import type { PropertyEmbed } from "@/lib/property-embeds";

/**
 * 掲載者サイトへの「3Dツアー埋め込みコード」コントロール
 * （DECISION_LOG D-008 のホスティング商品）。
 *
 * preview-share と対になるが用途が逆: あちらは公開前の社内確認用(期限30日)、
 * こちらは掲載者サイトでの常設公開用(期限なし・停止可)。
 * 掲載者が自社サイトへ貼る iframe スニペットを生成してコピーさせる。
 */

function embedUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://locahun3d.com";
  return `${origin}/embed/${token}`;
}

function snippet(token: string): string {
  return `<iframe src="${embedUrl(token)}" width="100%" height="520" style="border:0" allowfullscreen loading="lazy" title="3Dツアー"></iframe>`;
}

const DEFAULT_BUTTON_CLASS =
  "px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition";

export default function EmbedShare({
  propertyId,
  buttonClassName = DEFAULT_BUTTON_CLASS,
  buttonLabel = "埋め込みコード",
}: {
  propertyId: string;
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [embed, setEmbed] = useState<PropertyEmbed | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const [pending, start] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // パネルを開いた時だけ取得する（一覧の全物件分を先読みしない）。
  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    getPropertyEmbedAction(propertyId).then((e) => {
      if (!alive) return;
      setEmbed(e);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [open, loaded, propertyId]);

  const copy = async (text: string, which: "url" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* クリップボード不可の環境では手動選択にまかせる */
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button type="button" className={buttonClassName} onClick={() => setOpen((v) => !v)}>
        {buttonLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(92vw,460px)] border border-line bg-bg p-4 shadow-2xl">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-muted mb-2">
            サイト埋め込み
          </div>
          <p className="text-[11.5px] text-ink/70 leading-[1.8] mb-3">
            掲載者の自社サイトに3Dツアーを貼るためのコードです。閲覧者はログインも
            トークンも不要で、期限もありません。一般公開シーンのみが表示されます。
          </p>

          {!loaded ? (
            <div className="text-[12px] text-muted py-3">読み込み中…</div>
          ) : !embed ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await createPropertyEmbedAction(propertyId);
                  if (res.ok) setEmbed(res.embed);
                })
              }
              className="w-full px-4 py-2.5 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition disabled:opacity-50"
            >
              埋め込みコードを発行
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`mono text-[9.5px] tracking-[0.2em] uppercase px-2 py-1 border ${
                    embed.enabled
                      ? "border-green-400/50 text-green-400"
                      : "border-amber-400/50 text-amber-400"
                  }`}
                >
                  {embed.enabled ? "公開中" : "停止中"}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await setPropertyEmbedEnabledAction(
                        embed.token,
                        !embed.enabled,
                      );
                      if (res.embed) setEmbed(res.embed);
                    })
                  }
                  className="mono text-[9.5px] tracking-[0.2em] uppercase border border-line px-2 py-1 text-muted hover:text-ink hover:border-ink transition disabled:opacity-50"
                >
                  {embed.enabled ? "停止する" : "再開する"}
                </button>
              </div>

              <div>
                <div className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted mb-1">
                  埋め込みコード
                </div>
                <textarea
                  readOnly
                  value={snippet(embed.token)}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full bg-[#111] border border-line text-[11px] text-ink/85 p-2 font-mono resize-none"
                />
                <button
                  type="button"
                  onClick={() => copy(snippet(embed.token), "code")}
                  className="mt-1 w-full px-3 py-2 mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
                >
                  {copied === "code" ? "コピーしました" : "コードをコピー"}
                </button>
              </div>

              <div>
                <div className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted mb-1">
                  URL（直接共有用）
                </div>
                <div className="flex gap-1.5">
                  <input
                    readOnly
                    value={embedUrl(embed.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 bg-[#111] border border-line text-[11px] px-2 py-1.5 text-ink/85 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copy(embedUrl(embed.token), "url")}
                    className="mono text-[9.5px] tracking-[0.2em] uppercase border border-line px-2.5 text-muted hover:text-ink hover:border-ink transition shrink-0"
                  >
                    {copied === "url" ? "済" : "コピー"}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-line">
                <a
                  href={embedUrl(embed.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[9.5px] tracking-[0.2em] uppercase text-muted hover:text-accent transition"
                >
                  表示を確認 →
                </a>
                {/* 失効は停止と違いURLごと無効化する（掲載者側の貼り替えが必要）。 */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        "このURLを完全に失効させます。掲載者のサイトに貼られている埋め込みは表示されなくなり、再発行しても別URLになります。よろしいですか？",
                      )
                    )
                      return;
                    start(async () => {
                      await revokePropertyEmbedAction(propertyId);
                      setEmbed(null);
                    });
                  }}
                  className="mono text-[9.5px] tracking-[0.2em] uppercase text-red-400/80 hover:text-red-400 transition disabled:opacity-50"
                >
                  失効
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full mono text-[9.5px] tracking-[0.2em] uppercase text-muted hover:text-ink transition"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
