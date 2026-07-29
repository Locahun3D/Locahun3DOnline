import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES, type ContactType } from "@/lib/contact-requests";
import ContactForm from "@/components/contact-form";
import { getCurrentUser } from "@/lib/dal";
import { repo } from "@/lib/store";
import { canCreateListing, resolveListingPrefill } from "@/lib/listing-funnel";

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
  license: {
    title: "データ利用・提携のご相談",
    titleEn: "Data use & partnership inquiries",
    lede: "データの再配布・AI学習データとしての利用・APIやデータ連携のご相談など。案件ごとに条件が異なるため、まずは気軽にご相談ください。",
    ledeEn: "Redistribution, use as AI training data, API or data-partnership ideas — terms vary by case, so just reach out and let's talk.",
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
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { type } = await params;
  const { property: propertyParam } = await searchParams;
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

  // エディターの「公開を申請」から ?property=<id> 付きで来たときだけ、
  // 物件データを読んでフォームに前もって入れる。
  // ⚠ パラメータは信用しない。所有者（または管理者）でなければ無視する。
  //    送信時にもサーバー側 requestPublishAction が同じ検証をする（二重防御）。
  // 判定は src/lib/listing-funnel.ts に集約（テストで固定してある）。
  // ここで所有者でなければ ?property= は無視され、初期値も出ない。
  const canOwn = canCreateListing(user?.role);
  const target =
    t === "listing" && propertyParam && canOwn ? await repo.get(propertyParam) : null;
  const prefill = resolveListingPrefill(user, target);

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

        {/* ══ 掲載依頼の導線 ══
            「まずスタジオ用アカウントを作る → 物件ページを作る → 3DGS以外を書いたら
            この依頼フォームで公開を申請する」という一本道にする。
            以前はロールに関係なくフォームを先出ししており、個人アカウントには
            「フォームで知らせてください」という行き止まりの注意書きしか出ていなかった。
            ⚠ 撮影スタジオは新規登録で自己申告できる種別（SELF_SIGNUP_ROLES）なので、
              既存の個人/制作会社アカウントは種別変更ではなく別アカウント作成に案内する
              （運営の手作業を挟まず、待たせないため）。 */}
        {t === "listing" && !prefill && (
          <div className="mb-8 border border-line bg-card p-5">
            {!user ? (
              <>
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
                  {en ? "Step 1 / 3" : "ステップ 1 / 3"}
                </div>
                <h2 className="text-[15px] font-bold mb-2">
                  {en ? "Create a studio account" : "まずスタジオ用アカウントを作成"}
                </h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {en
                    ? "Listings are created from a studio account. Sign up (free, no review) and you can start a listing page right away — we handle the 3D scan."
                    : "掲載ページはスタジオ用アカウントから作成します。登録は無料・審査なしで、すぐに掲載ページを作り始められます。3Dスキャンはこちらで対応します。"}
                </p>
                <Link
                  href={lh("/sign-up")}
                  className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition"
                >
                  {en ? "Create a studio account →" : "スタジオアカウントを作成 →"}
                </Link>
                <p className="mt-2 mono text-[10px] text-muted">
                  {en
                    ? "Choose “Filming studio” as the account type."
                    : "アカウント種別で「撮影スタジオ」を選択してください。"}
                </p>
              </>
            ) : canOwn ? (
              <>
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
                  {en ? "Step 2 / 3" : "ステップ 2 / 3"}
                </div>
                <h2 className="text-[15px] font-bold mb-2">
                  {en ? "Create the listing page" : "物件の掲載ページを作成"}
                </h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {en
                    ? "Fill in everything except the 3D scan — we shoot that. When you're done, the editor takes you here to request publication."
                    : "3Dスキャン以外の情報を入力してください（撮影はこちらで行います）。入力が終わったら、エディターからこのページに戻って公開を申請します。"}
                </p>
                <Link
                  href={lh("/admin/properties")}
                  className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition"
                >
                  {en ? "Go to listing pages →" : "掲載ページを作成する →"}
                </Link>
              </>
            ) : (
              <>
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
                  {en ? "Step 1 / 3" : "ステップ 1 / 3"}
                </div>
                <h2 className="text-[15px] font-bold mb-2">
                  {en ? "A studio account is required" : "スタジオ用アカウントが必要です"}
                </h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {en
                    ? "Your current account type cannot create listings. Sign up separately as a studio — it's free and takes effect immediately."
                    : "現在のアカウント種別では掲載ページを作成できません。スタジオ用に別途アカウントをご登録ください（無料・登録後すぐ利用可）。"}
                </p>
                <Link
                  href={lh("/sign-up")}
                  className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition"
                >
                  {en ? "Create a studio account →" : "スタジオアカウントを作成 →"}
                </Link>
                <p className="mt-2 mono text-[10px] text-muted">
                  {en
                    ? "Accounts are identified by email, so use a different address from this one."
                    : "アカウントはメールアドレスで識別されるため、今お使いのものとは別のアドレスをご用意ください。"}
                </p>
              </>
            )}
          </div>
        )}

        {/* 公開申請モード: エディターから物件を持って来た場合 */}
        {prefill && (
          <div className="mb-8 border border-accent/40 bg-accent/5 p-5">
            <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
              {en ? "Step 3 / 3" : "ステップ 3 / 3"}
            </div>
            <h2 className="text-[15px] font-bold mb-2">
              {en ? `Request publication: ${prefill.propertyName}` : `公開を申請: ${prefill.propertyName}`}
            </h2>
            <p className="text-[13px] leading-relaxed text-muted">
              {en
                ? "Company, property name and address are filled in from your listing. Tell us your preferred scan dates and a contact for the day — we'll shoot the 3D data and publish after a check."
                : "会社名・物件名・所在地は掲載ページの内容を入れてあります。スキャンの希望日と当日のご連絡先だけ記入して送信してください。3Dデータの撮影と確認のうえ公開します。"}
            </p>
            <p className="mt-2 mono text-[10px] text-muted">
              {en
                ? "The request is submitted when you send this form."
                : "この フォームを送信した時点で公開申請となります。"}
            </p>
          </div>
        )}

        {/* 掲載依頼のフォームは、掲載できる人にだけ見せる。
            未ログイン/個人/制作会社にはアカウント作成の導線だけを出す
            （送っても掲載できないフォームを踏ませない）。 */}
        {t !== "listing" || canOwn ? <ContactForm type={t} prefill={prefill} /> : null}
      </div>
    </div>
  );
}
