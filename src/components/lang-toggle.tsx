"use client";
import { usePathname } from "next/navigation";
import { stripLocale, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/components/locale-provider";

/**
 * EN / JA 言語トグル。現在のパスを保ったまま `/en` prefix を付け外しする。
 * 言語切替は middleware を確実に再実行させたいので通常リンク（ハードナビ）。
 * （useSearchParams はヘッダ全体を動的化するため使わない）
 *
 * 以前は JA/EN 2セルの枠付きグループ表示だったが、狭い画面でヘッダー内の
 * 他要素（カート・ログイン等）と詰まって見切れる実害があった。切替先の
 * 言語だけを表示する単一リンクにして幅を半減させる（マーケサイトの
 * ヘッダーとも表示ロジックを統一）。
 */
export default function LangToggle({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const base = stripLocale(pathname); // /en/x も /x も → /x（冪等）

  const jaHref = base;
  const enHref = base === "/" ? "/en" : `/en${base}`;
  const isJa = locale === "ja";

  return (
    <a
      href={isJa ? enHref : jaHref}
      className={`px-2 py-1 text-[11px] mono tracking-[0.12em] border border-line text-muted hover:text-accent hover:border-accent transition ${className}`}
      aria-label="Language"
    >
      {isJa ? "EN" : "JA"}
    </a>
  );
}

export type { Locale };
