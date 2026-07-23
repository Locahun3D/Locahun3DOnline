import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { getCurrentUser } from "@/lib/dal";
import { scanSubmissionRepo } from "@/lib/scan-submissions-repo";
import { scanStatusLabel } from "@/lib/scan-submissions";
import { categoryLabel } from "@/lib/schemas";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";
import ScanSubmitForm from "@/components/scan-submit-form";
import RevenueSimulator from "@/components/revenue-simulator";

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Bring your own scan｜Locahun 3D" : "持ち込みスキャン｜ロケハン3D",
  };
}

const STEPS_JA = [
  "申請（概要とサンプル画像のみ・データは非公開で預かります）",
  "当社で審査（需要と品質）",
  "当社が施設と権利交渉",
  "成立したら掲載・販売、売上を分配。不成立の場合、お預かりした内容は削除します。",
];

const STEPS_EN = [
  "Apply (only an overview and sample images — your data is held privately).",
  "We review it (demand and quality).",
  "We negotiate rights with the facility.",
  "If it succeeds, we list and sell it, and share the revenue. If not, everything we hold is deleted.",
];

const REVENUE_SHARE_JA = [
  "販売が成立した場合、当社が売主として販売し、代金の一部を撮影者へ使用料として分配します（後払い・四半期精算）。",
  "分配率は成立時に個別に合意します。施設側の許諾取得をご自身で進めていただけた場合、分配率を大幅に引き上げます。",
  "未精算額が¥10,000未満の場合は次回精算へ繰り越します。個人への支払いは源泉徴収の対象となる場合があります。",
];

const REVENUE_SHARE_EN = [
  "If a sale is concluded, we sell the data as the seller of record and pay a share of the price to you as a usage royalty (paid in arrears, settled quarterly).",
  "The exact share is agreed individually when the deal closes. If you help secure the facility's permission yourself, we substantially increase your share.",
  "Unsettled balances under ¥10,000 roll over to the next settlement. Payments to individuals may be subject to Japanese withholding tax.",
];

export default async function SubmitScanPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  const user = await getCurrentUser();
  const mySubmissions = user ? await scanSubmissionRepo.list({ userId: user.id }) : [];

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">SCAN</span>
        <span>{en ? "Bring your own scan" : "持ち込みスキャン"}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="max-w-[620px] mx-auto mb-10">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          LOCAHUN 3D / SCAN
        </div>
        <h1 className="serif text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.4] mb-4">
          {en ? "Bring your own scan" : "持ち込みスキャン"}
        </h1>
        <p className="text-[13.5px] text-muted leading-[1.9] mb-5">
          {en
            ? "This program lets you bring in a scan you captured yourself, and lets Locahun 3D negotiate rights with the facility before selling it."
            : "あなたが撮影したスキャンデータを、ロケハン3Dが施設と権利調整のうえ販売する持ち込みプログラムです。"}
        </p>
        <ol className="space-y-2 text-[13px] text-ink leading-[1.85] mb-6">
          {(en ? STEPS_EN : STEPS_JA).map((s, i) => (
            <li key={s} className="flex gap-2.5">
              <span className="mono text-[11px] text-accent shrink-0">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {/* 分配の仕組み — 「どう販売され、いくら受け取れるか」を申請前に理解して
            もらうための説明。施設同意を自分で取れると分配が上がるインセンティブも明記。 */}
        <div className="bg-white border border-line rounded-md px-5 py-4">
          <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2.5">
            {en ? "How revenue sharing works" : "分配の仕組み"}
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-muted leading-relaxed">
            {(en ? REVENUE_SHARE_EN : REVENUE_SHARE_JA).map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-accent shrink-0">・</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <RevenueSimulator />
      </header>

      <div className="max-w-[620px] mx-auto">
        {!user ? (
          <div className="bg-white border border-accent/50 px-7 py-9 text-center">
            <p className="text-[14px] leading-relaxed mb-4">
              {en
                ? "Sign in to submit your scan for review."
                : "申請にはサインインが必要です。"}
            </p>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(lh("/submit-scan"))}`}
              className="inline-block bg-accent text-white text-[14px] font-bold px-7 py-3 rounded-md hover:bg-accent/85 transition"
            >
              {en ? "Sign in to apply →" : "サインインして申請 →"}
            </Link>
          </div>
        ) : (
          <>
            <ScanSubmitForm />

            {mySubmissions.length > 0 && (
              <div className="mt-10">
                <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted mb-3">
                  {en ? "Your applications" : "あなたの申請一覧"}
                </div>
                <div className="flex flex-col gap-2.5">
                  {mySubmissions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white border border-line rounded-md px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5"
                    >
                      <span className="text-[13.5px] font-medium">
                        {s.locationName || (en ? "(untitled)" : "（無題）")}
                      </span>
                      <span className="mono text-[10px] tracking-[0.14em] uppercase text-muted">
                        {categoryLabel(s.category, locale)}
                      </span>
                      <StatusBadge status={s.status} en={en} />
                      <span className="mono text-[10.5px] text-muted ml-auto">
                        {fmtDateTimeLocaleJST(s.createdAt, en ? "en-US" : "ja-JP")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, en }: { status: Parameters<typeof scanStatusLabel>[0]; en: boolean }) {
  const color =
    status === "cleared"
      ? "bg-green-100 text-green-700 border-green-300"
      : status === "rejected"
        ? "bg-neutral-100 text-neutral-500 border-neutral-300"
        : "bg-accent/10 text-accent border-accent/40";
  return (
    <span className={`mono text-[10px] tracking-[0.14em] uppercase border rounded-full px-2.5 py-0.5 ${color}`}>
      {scanStatusLabel(status, en ? "en" : "ja")}
    </span>
  );
}
