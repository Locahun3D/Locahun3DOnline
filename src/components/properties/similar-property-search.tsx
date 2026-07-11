"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  findSimilarPropertiesAction,
  type FindSimilarState,
} from "@/lib/find-similar-actions";
import { useHref, useLocale } from "@/components/locale-provider";

/**
 * 「似た物件を探す」— 参考にしたいページのURLを貼ると、そのページの内容を
 * AIが読み取り、カタログの中から雰囲気・用途が近い物件を最大5件ピックアップする。
 * カタログの絞り込みUI(CatalogClient)とは独立した自己完結コンポーネント。
 */
export default function SimilarPropertySearch() {
  const [state, formAction, pending] = useActionState<FindSimilarState, FormData>(
    findSimilarPropertiesAction,
    undefined,
  );
  const en = useLocale() === "en";
  const lh = useHref();

  return (
    <div className="border border-line bg-white px-5 py-5 mb-6">
      <form action={formAction} className="flex flex-col sm:flex-row gap-2.5">
        <div className="flex-1">
          <label className="mono text-[10px] tracking-[0.2em] uppercase text-accent block mb-1.5">
            {en ? "Find similar locations from a URL" : "似た物件をURLから探す"}
          </label>
          <input
            name="url"
            type="url"
            required
            placeholder={
              en
                ? "https://... (a reference page showing the look you want)"
                : "https://…（イメージに近いページのURLを貼り付け）"
            }
            className="w-full border border-line rounded-md px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-accent transition"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 self-end px-5 py-2.5 mono text-[11px] tracking-[0.2em] uppercase bg-accent text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {pending ? (en ? "Searching…" : "検索中…") : en ? "Find similar →" : "似た物件を探す →"}
        </button>
      </form>

      {state?.ok === false && (
        <p className="mt-3 text-[12.5px] text-red-600">{state.error}</p>
      )}

      {state?.ok === true && (
        <div className="mt-4 pt-4 border-t border-line">
          {state.matches.length === 0 ? (
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
                {state.matches.map((m) => (
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
