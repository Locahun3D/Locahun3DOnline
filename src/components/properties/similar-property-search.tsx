"use client";

import { useState } from "react";
import Link from "next/link";
import { useHref, useLocale } from "@/components/locale-provider";
import type { SimilarMatch } from "@/lib/find-similar";

/**
 * 「似た物件を探す」— 参考にしたいページのURLを貼ると、そのページの内容を
 * AIが読み取り、カタログの中から雰囲気・用途が近い物件を最大5件ピックアップする。
 * カタログの絞り込みUI(CatalogClient)とは独立した自己完結コンポーネント。
 * /api/find-similar (Route Handler) を直接fetchする — Server Actionでは
 * getCloudflareContext() 経由のANTHROPIC_API_KEY取得が機能しなかったため。
 */
export default function SimilarPropertySearch() {
  const [pending, setPending] = useState(false);
  const [matches, setMatches] = useState<SimilarMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const en = useLocale() === "en";
  const lh = useHref();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const url = new FormData(e.currentTarget).get("url");
    if (typeof url !== "string" || !url.trim()) return;
    setPending(true);
    setError(null);
    setMatches(null);
    try {
      const res = await fetch("/api/find-similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as
        | { ok: true; matches: SimilarMatch[] }
        | { ok: false; error: string };
      if (data.ok) setMatches(data.matches);
      else setError(data.error);
    } catch {
      setError(en ? "A network error occurred." : "通信エラーが発生しました。");
    } finally {
      setPending(false);
    }
  };

  return (
    // 768–1199px(iPad帯) は html の zoom が 0.8 なので PC と同じ padding だと
    // バーが実画面で間延びして見える。帯だけ詰める。
    // ⚠ sm: と min-[768px]: を同じプロパティで重ねると Tailwind の出力順で
    // どちらが勝つか不定なので、必ず max-[Npx] で排他の範囲にすること
    // （max-[Npx] は `not (min-width:Npx)` = N 自身を含まない）。
    <div className="border border-line bg-white px-3 sm:px-4 py-2 sm:max-[768px]:py-3 min-[768px]:max-[1200px]:py-1.5 min-[1200px]:py-3 mb-3 sm:max-[768px]:mb-6 min-[768px]:max-[1200px]:mb-3 min-[1200px]:mb-6">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="shrink-0 flex items-center gap-1 text-accent">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d="M9 17H7a5 5 0 0 1 0-10h2" />
            <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <span className="hidden min-[420px]:inline mono text-[10px] sm:text-[11px] tracking-[0.06em] sm:tracking-[0.14em] uppercase whitespace-nowrap">
            {en ? "Search by URL" : "URLから探す"}
          </span>
          <span className="min-[420px]:hidden mono text-[10px] tracking-[0.06em] uppercase whitespace-nowrap">
            {en ? "URL" : "URL検索"}
          </span>
        </div>
        <input
          name="url"
          type="url"
          required
          aria-label={en ? "Find similar locations from a URL" : "似た物件をURLから探す"}
          placeholder={
            en
              ? "Paste a reference page URL…"
              : "イメージに近いページのURLを貼り付け…"
          }
          className="flex-1 min-w-0 border border-line rounded-md px-3 py-2 min-[768px]:max-[1200px]:py-1 text-[12px] sm:text-[13px] focus:outline-none focus:border-accent transition"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-3 sm:px-5 py-2 min-[768px]:max-[1200px]:py-1 mono text-[10px] sm:text-[11px] tracking-[0.08em] sm:tracking-[0.2em] uppercase bg-accent text-white hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "…" : en ? "Find →" : "探す →"}
        </button>
      </form>

      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

      {matches && (
        <div className="mt-4 pt-4 border-t border-line">
          {matches.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              {en
                ? "No similar locations found in the current catalog."
                : "現在のカタログの中に、近い雰囲気の物件は見つかりませんでした。"}
            </p>
          ) : (
            <>
              <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-3">
                {en ? "Similar locations" : "似ている物件"}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {matches.map((m) => (
                  <Link
                    key={m.id}
                    href={lh(`/properties/${m.id}`)}
                    className="block border border-line hover:border-accent px-3.5 py-2.5 transition max-w-[280px]"
                  >
                    <div className="text-[13px] font-medium text-ink">{m.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{m.reason}</div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
