import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES, type ContactType } from "@/lib/contact-requests";
import ContactForm from "@/components/contact-form";

const COPY: Record<ContactType, { title: string; titleEn: string; lede: string; ledeEn: string }> = {
  bug: {
    title: "バグ報告",
    titleEn: "Bug report",
    lede: "不具合のご報告ありがとうございます。再現手順があると調査が早く進みます。",
    ledeEn: "Thanks for the report — reproduction steps help us investigate faster.",
  },
  request: {
    title: "ほしい物件追加",
    titleEn: "Request a location",
    lede: "「こんな物件を3Dで見たい」というリクエストを、今後のスキャン対象の選定に活用します。",
    ledeEn: "Tell us what kind of location you'd like scanned — it feeds our future scan list.",
  },
  listing: {
    title: "掲載依頼",
    titleEn: "List your space",
    lede: "物件を拝見し、担当者より掲載の流れ（3Dスキャン・撮影・公開）をご案内します。現在、キャンペーンにより掲載費は無料です。",
    ledeEn: "We'll review your space and walk you through listing it (3D scan, shoot, publish). Listing is currently free during our launch campaign.",
  },
  general: {
    title: "ご相談",
    titleEn: "General inquiry",
    lede: "料金プラン・法人契約・提携のご相談など、なんでもどうぞ。",
    ledeEn: "Pricing plans, corporate contracts, partnerships — anything at all.",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const c = COPY[type as ContactType];
  return { title: c ? `${c.title}｜お問い合わせ｜ロケハン3D` : "お問い合わせ" };
}

export default async function ContactTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!CONTACT_TYPES.includes(type as ContactType)) notFound();
  const t = type as ContactType;
  const copy = COPY[t];

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="theme-online frame pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CONTACT</span>
        <span>{en ? copy.titleEn : copy.title}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <div className="max-w-[620px] mx-auto">
        <Link
          href={lh("/contact")}
          className="text-[12px] text-muted hover:text-accent transition"
        >
          {en ? "← Back to contact" : "← お問い合わせ一覧に戻る"}
        </Link>

        <div className="mono text-[10px] tracking-[0.4em] uppercase text-accent mt-5 mb-2">
          Contact / {t}
        </div>
        <h1 className="serif text-[clamp(1.6rem,3vw,2.2rem)] font-bold leading-[1.4] mb-3">
          {en ? copy.titleEn : copy.title}
        </h1>
        {t === "listing" && (
          <div className="inline-block mono text-[10px] tracking-[0.2em] uppercase bg-accent/10 text-accent border border-accent/40 rounded-full px-3 py-1 mb-4">
            {en ? "Listing & scan measurement free during our launch campaign" : "現在、掲載＆スキャン計測無料キャンペーン中"}
          </div>
        )}
        <p className="text-[13.5px] text-muted leading-[1.9] mb-8">
          {en ? copy.ledeEn : copy.lede}
        </p>

        <ContactForm type={t} />
      </div>
    </div>
  );
}
