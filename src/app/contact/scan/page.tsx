import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPE_LABEL } from "@/lib/contact-requests";
import ScanRequest from "@/components/contact/scan-request";

/**
 * /contact/scan — 制作側スキャン依頼（2026-08-16 新設・本人指示）。
 *
 * - 概算シミュレーターは元々 /demo にあり、統合で一度 /pricing に置いたものを
 *   ここへ移した。/pricing は視聴サブスクの話に専念する。
 * - 計算式・金額・選択肢は移設元のまま（`src/components/demo/estimate-simulator.tsx`）。
 * - 静的セグメントなので動的ルート /contact/[type] より優先される。
 *   EN は middleware が /en/contact/scan → /contact/scan に rewrite する。
 */
export async function generateMetadata() {
  const locale = await getLocale();
  return locale === "en"
    ? {
        title: "Scan request | Contact",
        description:
          "Request a 3D scan of a location or facility for your shoot. Get a ballpark from shoot scale, number of locations and capture method, then send it with your inquiry.",
      }
    : {
        title: `${CONTACT_TYPE_LABEL.scan}｜お問い合わせ｜ロケハン3D`,
        description:
          "撮影・映像制作のためのロケ地・施設スキャンのご依頼。撮影規模・地点数・取得方法から概算を出し、その内容のままお問い合わせできます。",
      };
}

export default async function ContactScanPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame ui-page-shell pb-12 sm:pb-32">

      {/* シミュレーターは移設元と同じ 1000px。他の /contact/* （620/760px）より
          広いのは、選択欄が2列＋見積カードが横並びになるため。 */}
      <div className="max-w-[1000px] mx-auto">
        <Link
          href={lh("/contact")}
          className="inline-flex items-center min-h-[44px] mb-2 text-[12px] text-muted hover:text-accent transition"
        >
          {en ? "← Back to contact" : "← お問い合わせ一覧に戻る"}
        </Link>

        <header className="ui-page-header">
        <h1 className="ui-page-title">
          {en ? "Scan request" : CONTACT_TYPE_LABEL.scan}
        </h1>
        <p className="ui-page-lead text-[14px] text-muted">
          {en ? (
            "Request a 3D scan of a location or facility for your shoot. Pick a shoot date and a few options for an instant ballpark — for a detailed quote, send it with the form below."
          ) : (
            /* 句点ごとに改行（本人指示 2026-08-27）。全端末共通なので素の <br />。 */
            <>
              撮影・映像制作のためのロケ地・施設スキャンのご依頼を受け付けています。
              <br />
              撮影日と各項目を選ぶと概算が出ます。
              <br />
              詳細見積は下のフォームからご依頼ください。
            </>
          )}
        </p>

        </header>
        <ScanRequest en={en} />
      </div>
    </div>
  );
}
