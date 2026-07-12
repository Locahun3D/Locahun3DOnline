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
    <div className="border border-line bg-white px-4 py-3 mb-6">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          name="url"
          type="url"
          required
          aria-label={en ? "Find similar locations from a URL" : "似た物件をURLから探す"}
          placeholder={
            en
              ? "Find similar locations — paste a reference URL…"
              : "似た物件を探す — イメージに近いページのURLを貼り付け…"
          }
          className="flex-1 min-w-0 border border-line rounded-md px-3 py-2 text-[12px] sm:text-[13px] focus:outline-none focus:border-accent transition"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-3 sm:px-5 py-2 mono text-[10px] sm:text-[11px] tracking-[0.08em] sm:tracking-[0.2em] uppercase bg-accent text-white hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
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
