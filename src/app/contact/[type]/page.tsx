import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES, type ContactType } from "@/lib/contact-requests";
import ContactForm from "@/components/contact-form";
import { getCurrentUser } from "@/lib/dal";

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
    lede: "物件を拝見し、担当者より掲載の流れ（3Dスキャン・撮影・公開）をご案内します。現在、キャンペーンにより掲載費は無料です（2026年12月31日まで）。",
    ledeEn: "We'll review your space and walk you through listing it (3D scan, shoot, publish). Listing is currently free during our launch campaign (through Dec 31, 2026).",
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
  const en = (await getLocale()) === "en";
  if (!c) return { title: en ? "Contact" : "お問い合わせ" };
  return {
    title: en ? `${c.titleEn}｜Contact｜Locahun 3D` : `${c.title}｜お問い合わせ｜ロケハン3D`,
  };
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
  // 掲載依頼CTAのロール分岐に使う。individual/production が /admin/properties を
  // 踏むと requireAdminOrStudioOwner が redirect("/") で無言で弾くため、
  // 行き止まりリンクを見せないよう事前に振り分ける。
  const user = t === "listing" ? await getCurrentUser() : null;

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
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
            {en
              ? "Listing & scan measurement free during our launch campaign (through Dec 31, 2026)"
              : "現在、掲載＆スキャン計測無料キャンペーン中（2026年12月31日まで）"}
          </div>
        )}
        <p className="text-[13.5px] text-muted leading-[1.9] mb-8">
          {en ? copy.ledeEn : copy.lede}
        </p>

        {/* 掲載依頼は「問い合わせて待つ」以外に、その場で下書きを作って
            情報を埋め始められる道も用意する（審査は公開時に行うので、
            下書き作成自体は待たせる必要がない）。
            ロールで3分岐: 未ログイン→新規登録導線／studio・admin→下書き作成／
            individual・production→ /admin/properties は requireAdminOrStudioOwner
            が redirect("/") で無言で弾くため、行き止まりリンクを見せない。 */}
        {t === "listing" && (
          <div className="mb-8 border border-line bg-card p-4">
            {!user ? (
              <>
                <p className="text-[13px] leading-relaxed">
                  {en
                    ? "Prefer to get started right away? Create a listing draft and fill in what you know. We'll handle the 3D scan and publish it after a check."
                    : "先に進めたい場合は、いますぐ掲載ページの下書きを作れます。分かる範囲で入力しておいてください。3D撮影と公開はこちらで対応します。"}
                </p>
                <Link
                  href={lh("/sign-up")}
                  className="mt-3 inline-block border border-accent/50 px-4 py-2 text-[12px] text-accent hover:bg-accent/10 transition"
                >
                  {en ? "Sign up and start a draft →" : "新規登録して下書きを作る →"}
                </Link>
                <p className="mt-2 mono text-[10px] text-muted">
                  {en
                    ? "Choose “Filming studio” as the account type when you sign up."
                    : "登録時にアカウント種別で「撮影スタジオ」を選択してください。"}
                </p>
              </>
            ) : user.role === "studio" || user.role === "admin" ? (
              <>
                <p className="text-[13px] leading-relaxed">
                  {en
                    ? "Prefer to get started right away? Create a listing draft and fill in what you know. We'll handle the 3D scan and publish it after a check."
                    : "先に進めたい場合は、いますぐ掲載ページの下書きを作れます。分かる範囲で入力しておいてください。3D撮影と公開はこちらで対応します。"}
                </p>
                <Link
                  href={lh("/admin/properties")}
                  className="mt-3 inline-block border border-accent/50 px-4 py-2 text-[12px] text-accent hover:bg-accent/10 transition"
                >
                  {en ? "Create a listing draft →" : "掲載ページの下書きを作る →"}
                </Link>
              </>
            ) : (
              <p className="mono text-[10px] text-muted">
                {en
                  ? "Your current account type cannot create listings. To switch to a studio account, let us know via the form below."
                  : "現在のアカウント種別では掲載ページを作成できません。スタジオ用アカウントへの切り替えをご希望の場合は、下のフォームからその旨をお知らせください。"}
              </p>
            )}
          </div>
        )}

        <ContactForm type={t} />
      </div>
    </div>
  );
}
