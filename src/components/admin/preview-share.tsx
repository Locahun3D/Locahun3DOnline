"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  createPropertyPreviewAction,
  getPropertyPreviewAction,
  revokePropertyPreviewAction,
} from "@/app/admin/properties/preview-actions";
import type { PropertyPreview } from "@/lib/property-previews";

/**
 * エディターのヘッダーに置く「限定プレビュー共有URL」コントロール。
 * 先方スタジオに公開前の物件(draft含む)を確認してもらうログイン不要リンクを
 * 発行/コピー/再発行/失効できる。既定30日で失効。1物件1トークン。
 */

function buildUrl(token: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://locahun3d.com";
  return `${origin}/preview/${token}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const DEFAULT_BUTTON_CLASS =
  "px-4 py-2 mono text-[10px] tracking-[0.22em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition";

export default function PreviewShare({
  propertyId,
  buttonClassName = DEFAULT_BUTTON_CLASS,
  buttonLabel = "共有URL",
}: {
  propertyId: string;
  /** 呼び出し元のパネルに合わせてボタン見た目を差し替える（既定は上部ツールバー用）。 */
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PropertyPreview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPropertyPreviewAction(propertyId)
      .then((p) => {
        setPreview(p);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [propertyId]);

  // ポップオーバー外クリックで閉じる。
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const expired = preview
    ? preview.expiresAt <= new Date().toISOString()
    : false;
  const url = preview ? buildUrl(preview.token) : "";

  const issue = () =>
    start(async () => {
      const r = await createPropertyPreviewAction(propertyId);
      if (r.ok) setPreview(r.preview);
    });
  const revoke = () =>
    start(async () => {
      await revokePropertyPreviewAction(propertyId);
      setPreview(null);
      setCopied(false);
    });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — ユーザーが手動で選択できるよう input は残す */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        {buttonLabel}{preview && !expired ? " ●" : ""}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] z-50 border border-line bg-white shadow-xl p-4 text-left normal-case tracking-normal">
          <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
            限定プレビューURL（共有用）
          </div>
          <p className="text-[11.5px] text-ink/70 leading-[1.7] mb-3">
            先方スタジオに公開前の物件を確認してもらうログイン不要リンク。既定30日で失効します。
          </p>

          {!loaded ? (
            <div className="text-[12px] text-muted py-2">読み込み中…</div>
          ) : preview ? (
            <>
              <div className="flex items-stretch gap-1.5 mb-2">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 border border-line px-2 py-1.5 text-[11px] bg-[#fafafa]"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-bold border border-accent text-accent hover:bg-accent hover:text-white transition"
                >
                  {copied ? "コピー済" : "コピー"}
                </button>
              </div>
              <div
                className={`text-[11px] mb-3 ${
                  expired ? "text-red-600 font-bold" : "text-muted"
                }`}
              >
                {expired
                  ? "⚠ 期限切れ（再発行してください）"
                  : `有効期限: ${fmtDate(preview.expiresAt)}`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={issue}
                  disabled={pending}
                  className="px-3 py-1.5 text-[11px] border border-line hover:border-ink transition disabled:opacity-50"
                >
                  再発行
                </button>
                <button
                  type="button"
                  onClick={revoke}
                  disabled={pending}
                  className="px-3 py-1.5 text-[11px] border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                >
                  失効させる
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={issue}
              disabled={pending}
              className="w-full px-3 py-2 text-[12px] font-bold bg-accent text-white hover:brightness-105 transition disabled:opacity-50"
            >
              {pending ? "発行中…" : "限定プレビューURLを発行"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
