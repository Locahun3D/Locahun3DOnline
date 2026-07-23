import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { fmtDateOnlyJST } from "@/lib/date-format";

export default async function SiteFooter() {
  const year = fmtDateOnlyJST(new Date()).slice(0, 4);
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  return (
    // モバイルは margin 0 — ライト背景ページで margin が「裸の黒帯」として
    // 見える実害があったため、コンテンツ側の pb だけで間隔を作る。
    <footer className="relative mt-0 sm:mt-32 border-t border-line">
      <div className="frame pt-8 pb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted">
          {en
            ? `© ${year} Locahun 3D — KWI Inc.`
            : `© ${year} ロケハン3D — KWI株式会社`}
        </div>
        <nav className="flex flex-wrap gap-4 mono text-[10px] tracking-[0.18em] uppercase text-muted">
          <Link href={lh("/terms/service")} className="hover:text-foreground transition">
            {en ? "Terms of Service" : "利用規約"}
          </Link>
          <Link href={lh("/privacy")} className="hover:text-foreground transition">
            {en ? "Privacy Policy" : "プライバシーポリシー"}
          </Link>
          <Link href={lh("/terms/tokushoho")} className="hover:text-foreground transition">
            {en ? "Commercial Disclosure" : "特定商取引法"}
          </Link>
          <Link href={lh("/terms/data-download")} className="hover:text-foreground transition">
            {en ? "Purchase Terms" : "データ購入規約"}
          </Link>
          <Link href={lh("/submit-scan")} className="hover:text-foreground transition">
            {en ? "Bring your own scan" : "持ち込みスキャン"}
          </Link>
        </nav>
      </div>

      <div
        aria-hidden
        className="absolute left-0 right-0 bottom-0 h-2"
        style={{
          backgroundImage: "linear-gradient(90deg, #000 50%, transparent 50%)",
          backgroundSize: "12px 8px",
          backgroundColor: "rgba(255,255,255,.04)",
        }}
      />
    </footer>
  );
}
