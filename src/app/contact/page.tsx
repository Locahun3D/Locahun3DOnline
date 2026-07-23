import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES, CONTACT_TYPE_LABEL, type ContactType } from "@/lib/contact-requests";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Contact｜Locahun 3D" : "お問い合わせ｜ロケハン3D" };
}

const HUB_CARDS: { type: ContactType; desc: string; descEn: string; go: string; goEn: string }[] = [
  {
    type: "bug",
    desc: "サイトやビューアーの不具合をお知らせください。再現手順があると助かります。",
    descEn: "Let us know about a bug on the site or 3D viewer. Reproduction steps help a lot.",
    go: "報告フォームへ",
    goEn: "Go to bug report",
  },
  {
    type: "request",
    desc: "「このエリア・この種類の物件を3Dで見たい」というリクエストを受け付けています。",
    descEn: "Tell us a location or area you'd like to see scanned in 3D.",
    go: "リクエストフォームへ",
    goEn: "Go to request form",
  },
  {
    type: "listing",
    desc: "スタジオ・ロケ地のオーナー様。物件を3Dスキャンして掲載しませんか。",
    descEn: "Studio and location owners — list your space with a 3D scan.",
    go: "掲載のご案内へ",
    goEn: "Go to listing inquiry",
  },
  {
    type: "general",
    desc: "料金・法人契約・提携のご相談など、分類に迷ったらこちらへ。",
    descEn: "Pricing, corporate plans, partnerships — anything else.",
    go: "相談フォームへ",
    goEn: "Go to consultation form",
  },
  {
    type: "license",
    desc: "データの再配布・AI学習利用・API/データ連携のご相談はこちら。案件ごとに条件が異なるため、まずはお気軽に。",
    descEn: "Redistribution, AI-training use, API / data partnerships — terms vary by case, so just ask.",
    go: "相談フォームへ",
    goEn: "Go to consultation form",
  },
];

export default async function ContactHubPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CONTACT</span>
        <span>0.4</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="text-center max-w-[60ch] mx-auto mb-14">
        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mb-3">
          LOCAHUN 3D / ONLINE
        </div>
        <h1 className="serif text-[clamp(1.5rem,4.5vw,3rem)] font-bold leading-[1.3] mb-4">
          {en ? "Contact" : "お問い合わせ"}
        </h1>
        <p className="text-[14px] text-muted leading-[1.95]">
          {en ? "Please choose the topic that fits your request." : "ご用件をお選びください。"}
        </p>
      </header>

      {/* ピックアップ — 掲載依頼（無料キャンペーン中）を優先訴求 */}
      <Link
        href={lh("/contact/listing")}
        className="block max-w-[760px] mx-auto mb-6 bg-white border-2 border-accent px-7 py-7 hover:bg-accent/[0.04] transition relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 mono text-[9.5px] tracking-[0.2em] uppercase bg-accent text-white px-3 py-1">
          {en ? "Pick up" : "ピックアップ"}
        </div>
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
          /contact/listing
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <div className="text-[18px] font-bold">
            {en ? CONTACT_TYPE_LABEL_EN.listing : CONTACT_TYPE_LABEL.listing}
          </div>
          <span className="mono text-[9.5px] tracking-[0.16em] uppercase bg-accent/10 text-accent border border-accent/40 rounded-full px-2.5 py-0.5">
            {en
              ? "Listing & scan measurement free during our launch campaign (through Dec 31, 2026)"
              : "現在、掲載＆スキャン計測無料キャンペーン中（2026年12月31日まで）"}
          </span>
        </div>
        <p className="text-[12.5px] text-muted leading-[1.85] mb-3 max-w-[56ch]">
          {en ? HUB_CARDS.find((c) => c.type === "listing")!.descEn : HUB_CARDS.find((c) => c.type === "listing")!.desc}
        </p>
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
          {(en ? HUB_CARDS.find((c) => c.type === "listing")!.goEn : HUB_CARDS.find((c) => c.type === "listing")!.go)} →
        </div>
      </Link>

      <div className="grid sm:grid-cols-3 gap-4 max-w-[760px] mx-auto">
        {CONTACT_TYPES.filter((type) => type !== "listing").map((type) => {
          const card = HUB_CARDS.find((c) => c.type === type)!;
          return (
            <Link
              key={type}
              href={lh(`/contact/${type}`)}
              className="block bg-white border border-line px-6 py-6 hover:border-accent transition"
            >
              <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
                /contact/{type}
              </div>
              <div className="text-[16px] font-bold mb-2">
                {en ? CONTACT_TYPE_LABEL_EN[type] : CONTACT_TYPE_LABEL[type]}
              </div>
              <p className="text-[12px] text-muted leading-[1.8] mb-3">
                {en ? card.descEn : card.desc}
              </p>
              <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
                {(en ? card.goEn : card.go)} →
              </div>
            </Link>
          );
        })}
      </div>

      {/* 持ち込みスキャン導線 — 問い合わせ種別ではなく専用申請フォームへ誘導 */}
      <Link
        href={lh("/submit-scan")}
        className="block max-w-[760px] mx-auto mt-6 bg-white border border-line px-7 py-6 hover:border-accent transition"
      >
        <div className="mono text-[10px] tracking-[0.3em] uppercase text-accent mb-3">
          /submit-scan
        </div>
        <div className="text-[16px] font-bold mb-2">
          {en ? "Bring your own scan" : "持ち込みスキャン"}
        </div>
        <p className="text-[12px] text-muted leading-[1.8] mb-3 max-w-[56ch]">
          {en
            ? "Captured a scan of a real space yourself? We negotiate rights with the facility and sell it on Locahun 3D, sharing the revenue with you."
            : "あなたが撮影したスキャンデータを、ロケハン3Dが施設と権利調整のうえ販売し、売上を分配するプログラムです。"}
        </p>
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent">
          {en ? "Apply" : "申請フォームへ"} →
        </div>
      </Link>
    </div>
  );
}

const CONTACT_TYPE_LABEL_EN: Record<ContactType, string> = {
  bug: "Bug report",
  request: "Request a location",
  listing: "List your space",
  general: "General inquiry",
  license: "Data use & partnerships",
};
