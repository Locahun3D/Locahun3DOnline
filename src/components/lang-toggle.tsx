"use client";
import { usePathname } from "next/navigation";
import { stripLocale, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/components/locale-provider";

/**
 * EN / JA 言語トグル。現在のパスを保ったまま `/en` prefix を付け外しする。
 * 言語切替は middleware を確実に再実行させたいので通常リンク（ハードナビ）。
 * （useSearchParams はヘッダ全体を動的化するため使わない）
 */
export default function LangToggle({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname() || "/";
  const base = stripLocale(pathname); // /en/x も /x も → /x（冪等）

  const jaHref = base;
  const enHref = base === "/" ? "/en" : `/en${base}`;

  const item = (active: boolean) =>
    `px-1.5 py-0.5 text-[11px] mono tracking-[0.12em] transition ${
      active
        ? "text-ink"
        : "text-muted/60 hover:text-accent"
    }`;

  return (
    <div
      className={`flex items-center border border-line rounded-[2px] overflow-hidden ${className}`}
      role="group"
      aria-label="Language"
    >
      <a
        href={jaHref}
        aria-current={locale === "ja" ? "true" : undefined}
        className={`${item(locale === "ja")} ${locale === "ja" ? "bg-line/40" : ""}`}
      >
        JA
      </a>
      <span className="w-px self-stretch bg-line" aria-hidden />
      <a
        href={enHref}
        aria-current={locale === "en" ? "true" : undefined}
        className={`${item(locale === "en")} ${locale === "en" ? "bg-line/40" : ""}`}
      >
        EN
      </a>
    </div>
  );
}

export type { Locale };
