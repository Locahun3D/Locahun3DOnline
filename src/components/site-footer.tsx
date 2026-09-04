import { headers } from "next/headers";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import SiteLink from "@/components/site-link";
import { isWorksHostname, onlineHref } from "@/lib/online-href";
import { fmtDateOnlyJST } from "@/lib/date-format";

export default async function SiteFooter() {
  const year = fmtDateOnlyJST(new Date()).slice(0, 4);
  const locale = await getLocale();
  const en = locale === "en";
  // works ホストでは絶対URL＋素の <a>（プリフェッチの 301 で CORS エラーになるため）。
  const onWorksHost = isWorksHostname((await headers()).get("host"));
  const lh = (href: string) => onlineHref(localizedHref(href, locale), onWorksHost);
  return (
    // モバイルは margin 0 — ライト背景ページで margin が「裸の黒帯」として
    // 見える実害があったため、コンテンツ側の pb だけで間隔を作る。
    <footer className="theme-online relative mt-0 sm:mt-32 border-t border-line">
      <div className="frame pt-8 pb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="mono text-[10px] tracking-[0.28em] uppercase text-ink/70">
          {en
            ? `© ${year} Locahun 3D — KWI Inc.`
            : `© ${year} ロケハン3D — KWI株式会社`}
        </div>
        {/* ⚠ スマホ(<720px)はタップ領域を 44px 確保する（Apple HIG / WCAG 2.5.5）。
            文字サイズ 10px は意匠なので変えず、min-h + inline-flex で「押せる高さ」
            だけを広げる。縦の gap は 8px 以上（隣接誤タップ防止）。
            2026-08-27: 以前は html の zoom 0.7 でこのリンクが実効 7px / 高さ 12.6px
            しか無かった。zoom を 1.0 に戻したうえで、ここも実寸で 44px にする。 */}
        <nav className="flex flex-wrap gap-4 max-[720px]:gap-x-4 max-[720px]:gap-y-2 mono text-[10px] tracking-[0.18em] uppercase text-ink/70">
          {[
            { href: "/terms/service", label: en ? "Terms of Service" : "利用規約" },
            { href: "/privacy", label: en ? "Privacy Policy" : "プライバシーポリシー" },
            { href: "/terms/tokushoho", label: en ? "Commercial Disclosure" : "特定商取引法" },
            { href: "/terms/data-download", label: en ? "Purchase Terms" : "データ購入規約" },
            { href: "/contact/listing", label: en ? "List your location" : "掲載依頼" },
          ].map((l) => (
            <SiteLink absolute={onWorksHost}
              key={l.href}
              href={lh(l.href)}
              className="hover:text-accent transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
            >
              {l.label}
            </SiteLink>
          ))}
        </nav>
      </div>

    </footer>
  );
}
