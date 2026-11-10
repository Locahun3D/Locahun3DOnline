"use client";

import { useState } from "react";
import Link from "next/link";
import { useHref, useLocale } from "@/components/locale-provider";
import TitleText from "@/components/title-text";
import type { AiSearchResult, OutsideCandidate, SimilarMatch } from "@/lib/find-similar";

/**
 * カタログの「AI検索」（2026-11-11 本人指示「AI検索機能にしたい。カタログに載っていない
 * ところも検索で引っかかるようにしたい」）。
 * URL でも言葉（「昭和のスナック」「工場の屋上」など）でもよい。結果は2段:
 *  - 掲載物件 … カタログから AI が近い順に選んだもの
 *  - 未掲載 … カタログに無い実在の場所の候補（Web 検索の出典つき・未確認と明記）。
 *    「スキャンをリクエスト」で /contact/request に名前と理由を入れて送れる。
 * カタログの絞り込みUI(CatalogClient)とは独立した自己完結コンポーネント。
 * /api/find-similar (Route Handler) を直接fetchする — Server Actionでは
 * getCloudflareContext() 経由のANTHROPIC_API_KEY取得が機能しなかったため。
 */

type Ok = Extract<AiSearchResult, { ok: true }>;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function SimilarPropertySearch() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Ok | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const en = useLocale() === "en";
  const lh = useHref();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    if (typeof q !== "string" || !q.trim()) return;
    setPending(true);
    setError(null);
    setResult(null);
    setQuery(q.trim());
    try {
      const res = await fetch("/api/find-similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q.trim(), locale: en ? "en" : "ja" }),
      });
      const data = (await res.json()) as AiSearchResult;
      if (data.ok) setResult(data);
      else setError(data.error);
    } catch {
      setError(en ? "A network error occurred." : "通信エラーが発生しました。");
    } finally {
      setPending(false);
    }
  };

  const requestHref = (o?: OutsideCandidate) => {
    const p = new URLSearchParams();
    if (o) {
      p.set("area", `${o.area} ${o.name}`.trim());
      p.set(
        "msg",
        en
          ? `I'd like to see this place in 3D: ${o.name} (${o.area})\nFound with the catalog AI search for "${query}".\nSource: ${o.sourceUrl}`
          : `この場所を3Dで見たいです: ${o.name}（${o.area}）\nカタログのAI検索「${query}」で見つけました。\n出典: ${o.sourceUrl}`,
      );
    } else if (query) {
      p.set(
        "msg",
        en ? `Looking for a location like: ${query}` : `こんな場所を探しています: ${query}`,
      );
    }
    const qs = p.toString();
    return lh(`/contact/request${qs ? `?${qs}` : ""}`);
  };

  const matches: SimilarMatch[] = result?.matches ?? [];
  const outside: OutsideCandidate[] = result?.outside ?? [];

  return (
    // 768–1199px(iPad帯) は html の zoom が 0.8 なので PC と同じ padding だと
    // バーが実画面で間延びして見える。帯だけ詰める。
    // ⚠ sm: と min-[768px]: を同じプロパティで重ねると Tailwind の出力順で
    // どちらが勝つか不定なので、必ず max-[Npx] で排他の範囲にすること
    // （max-[Npx] は `not (min-width:Npx)` = N 自身を含まない）。
    <div className="border border-line bg-white px-3 sm:px-4 py-2 min-[768px]:max-[1200px]:py-1.5">
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="shrink-0 flex items-center gap-1 text-accent">
          {/* きらめき（AI）アイコン */}
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
            <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
            <path d="M19 3v4M17 5h4" />
          </svg>
          <span className="mono text-[10px] sm:text-[11px] tracking-[0.06em] sm:tracking-[0.14em] uppercase whitespace-nowrap">
            {en ? "AI search" : "AI検索"}
          </span>
        </div>
        <input
          name="q"
          type="text"
          required
          maxLength={300}
          enterKeyHint="search"
          aria-label={en ? "AI search: a URL or words" : "AI検索（URLまたは言葉）"}
          placeholder={
            en ? "A URL, or words like “Showa-era snack bar”" : "URL、または「昭和のスナック」「工場の屋上」など"
          }
          className="flex-1 min-w-0 border border-line rounded-md px-3 py-2 max-[720px]:min-h-[44px] min-[768px]:max-[1200px]:py-1 text-[12px] sm:text-[13px] focus:outline-none focus:border-accent transition"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 px-3 sm:px-5 py-2 max-[720px]:min-h-[44px] min-[768px]:max-[1200px]:py-1 mono text-[10px] max-[720px]:text-[11px] sm:text-[11px] tracking-[0.08em] sm:tracking-[0.2em] uppercase bg-accent text-white hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
        >
          {pending ? "…" : en ? "Find →" : "探す →"}
        </button>
      </form>

      {pending && (
        <p className="mt-3 text-[12px] text-muted" role="status">
          {en ? "Searching the catalog and the web… (up to ~30 s)" : "カタログとWebを探しています…（30秒ほどかかることがあります）"}
        </p>
      )}

      {error && <p className="mt-3 text-[12.5px] text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 pt-4 border-t border-line space-y-6" aria-live="polite">
          {result.source === "mock" && (
            <p className="text-[11px] text-red-600">
              {en ? "MOCK MODE (AI_SEARCH_MOCK=1) — not real results." : "モック表示中（AI_SEARCH_MOCK=1）。実際の検索結果ではありません。"}
            </p>
          )}

          {/* 掲載物件 */}
          <section>
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-3">
              {en ? "On Locahun 3D" : "掲載物件"}
            </div>
            {matches.length === 0 ? (
              <p className="text-[12.5px] text-muted">
                {en ? "No close match in the current catalog." : "現在のカタログには、近い物件が見つかりませんでした。"}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2.5">
                {matches.map((m) => (
                  <Link
                    key={m.id}
                    href={lh(`/properties/${m.id}`)}
                    className="block border border-line hover:border-accent px-3.5 py-2.5 transition sm:max-w-[280px]"
                  >
                    <div className="text-[13px] font-medium text-ink">
                      <TitleText text={m.title} />
                    </div>
                    {m.reason && <div className="text-[11px] text-muted mt-0.5">{m.reason}</div>}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 未掲載（AI が Web で見つけた候補） */}
          {result.source !== "heuristic" && (
            <section>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <span className="mono text-[10px] tracking-[0.2em] uppercase text-accent">
                  {en ? "Not listed yet" : "未掲載"}
                </span>
                <span className="text-[11px] text-muted">
                  {en ? "Found by AI on the web · unverified" : "AIがWebで見つけた候補・未確認"}
                </span>
              </div>
              <p className="text-[11.5px] text-muted leading-[1.8] mb-3">
                {en ? (
                  "These places are not on Locahun 3D. Details and filming permission are unverified — check the source page."
                ) : (
                  <>
                    ロケハン3Dには未掲載の場所です。
                    <br />
                    内容・撮影可否は確認していないので、出典ページでお確かめください。
                  </>
                )}
              </p>
              {outside.length === 0 ? (
                <p className="text-[12.5px] text-muted">
                  {en ? "No candidates with a source were found." : "出典つきの候補は見つかりませんでした。"}
                </p>
              ) : (
                <ul className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-2.5">
                  {outside.map((o) => (
                    <li key={o.sourceUrl + o.name} className="border border-dashed border-line px-3.5 py-3">
                      <div className="text-[13px] font-medium text-ink">
                        <TitleText text={o.name} />
                      </div>
                      {o.area && <div className="text-[11px] text-muted mt-0.5">{o.area}</div>}
                      {o.reason && <div className="text-[12px] text-ink/80 mt-1.5 leading-[1.7]">{o.reason}</div>}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                        <a
                          href={o.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-[11px] text-muted underline underline-offset-2 hover:text-accent break-all"
                        >
                          {en ? "Source: " : "出典: "}
                          {hostOf(o.sourceUrl)} ↗
                        </a>
                        <Link
                          href={requestHref(o)}
                          className="inline-flex items-center min-h-[36px] text-[12px] font-bold text-accent hover:underline"
                        >
                          {en ? "Request a 3D scan →" : "スキャンをリクエスト →"}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <p className="text-[11.5px] text-muted">
            {en ? "Can't find it? " : "見つからないときは"}
            <Link href={requestHref()} className="text-accent hover:underline">
              {en ? "Tell us what you're looking for →" : "探している場所を教えてください →"}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
