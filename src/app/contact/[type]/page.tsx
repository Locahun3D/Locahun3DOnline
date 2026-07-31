import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { CONTACT_TYPES } from "@/lib/contact-requests";
import ContactForm from "@/components/contact-form";
import ListingValue from "@/components/listing-value";
import SignupRequirements from "@/components/signup-requirements";
import { getCurrentUser } from "@/lib/dal";
import { repo } from "@/lib/store";
import { canCreateListing, canConvertToStudio, resolveListingPrefill, STUDIO_INTENT } from "@/lib/listing-funnel";
import { isFreeEmailDomain } from "@/lib/free-email-domains";
import { convertToStudioAction } from "@/lib/auth-actions";

/** 受付中の窓口だけ。CONTACT_TYPES と1:1（受付終了した種別は入れない＝URLは404）。 */
const COPY: Record<(typeof CONTACT_TYPES)[number], { title: string; titleEn: string; lede: string; ledeEn: string }> = {
  request: {
    title: "ほしい物件追加",
    titleEn: "Request a location",
    lede: "「こんな物件を3Dで見たい」というリクエストを、今後のスキャン対象の選定に活用します。",
    ledeEn: "Tell us what kind of location you'd like scanned — it feeds our future scan list.",
  },
  listing: {
    title: "掲載依頼",
    titleEn: "List your space",
    lede: "物件を拝見し、担当者より掲載の流れ（3Dスキャン・撮影・公開）をご案内します。掲載費は期限なしで無料、3Dスキャンの計測費も2026年12月31日まで無料です。",
    ledeEn: "We'll review your space and walk you through listing it (3D scan, shoot, publish). Listing is currently free during our launch campaign (through Dec 31, 2026).",
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
  const c = COPY[type as (typeof CONTACT_TYPES)[number]];
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
  // 受付終了した種別（バグ報告など）はここで404になる。
  if (!(CONTACT_TYPES as readonly string[]).includes(type)) notFound();
  const t = type as (typeof CONTACT_TYPES)[number];
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
  // 会社ドメインのメールでログイン中の個人アカウントは、別アカウントを作らせず
  // その場でスタジオへ切り替えられる（判定と強制は listing-funnel / auth-actions）。
  const canConvert = canConvertToStudio(user?.role, isFreeEmailDomain(user?.email ?? ""));
  const target =
    t === "listing" && propertyParam && canOwn ? await repo.get(propertyParam) : null;
  const prefill = resolveListingPrefill(user, target);

  // すでに撮影スタジオ（運営が権限を割り当てた場合を含む）なら、掲載依頼の
  // 案内は用済みなので物件管理へ直行させる。掲載ページは自分で作れるし、
  // 公開申請は ?property= 付きで来る別モードなので、ここに留める理由がない。
  // ⚠ prefill があるとき（＝エディターの「公開を申請」から来たとき）は
  //   このフォームが申請そのものなので絶対に飛ばさない。
  // ⚠ admin は運営作業でこのページを見たいことがあるので対象外。
  if (t === "listing" && !prefill && user?.role === "studio") {
    redirect(lh("/admin/properties"));
  }

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
              ? "Listing is always free — the 3D scan is free too through Dec 31, 2026"
              : "掲載費はずっと無料／3Dスキャン計測も2026年12月31日まで無料"}
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
        {/* 費用とメリットの図。公開申請モード(prefill)では既に掲載を決めた人なので出さない。 */}
        {t === "listing" && !prefill && <ListingValue en={en} />}

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
                  href={lh(`/sign-up?intent=${STUDIO_INTENT}`)}
                  className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition"
                >
                  {en ? "Create a studio account →" : "スタジオアカウントを作成 →"}
                </Link>
                <SignupRequirements en={en} />
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
            ) : canConvert ? (
              <>
                {/* 会社ドメインのメールでログイン済み。新規登録に送っても Clerk が
                    サインアップ画面を出さずマイページへ弾くうえ、撮影スタジオは
                    元々自己申告で選べる種別なので、このまま切り替える。 */}
                <div className="mono text-[10px] tracking-[0.24em] uppercase text-accent mb-2">
                  {en ? "Step 1 / 3" : "ステップ 1 / 3"}
                </div>
                <h2 className="text-[15px] font-bold mb-2">
                  {en ? "Switch this account to a studio account" : "このアカウントをスタジオアカウントにする"}
                </h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {en
                    ? `You're signed in with a company address (${user?.email}). No second account needed — switch this one to a studio account and start a listing page right away.`
                    : `会社のメールアドレス（${user?.email}）でログイン中です。別のアカウントを作る必要はありません。このアカウントをスタジオアカウントに切り替えると、すぐに掲載ページを作り始められます。`}
                </p>
                <form action={convertToStudioAction}>
                  <button className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition cursor-pointer">
                    {en ? "Switch to a studio account →" : "スタジオアカウントに切り替える →"}
                  </button>
                </form>
                <p className="mt-2 mono text-[10px] text-muted">
                  {en
                    ? "Free, no review. Viewing and purchases stay exactly as they are."
                    : "無料・審査なし。閲覧や購入の履歴はそのまま引き継がれます。"}
                </p>
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
                {/* ⚠ ログイン中に /sign-up へ送っても Clerk がサインアップ画面を出さず
                    マイページへ弾く（ユーザー報告）。先にサインアウトしてから
                    登録画面へ着地させる。 */}
                <Link
                  href={lh(`/sign-out?redirect=/sign-up%3Fintent=${STUDIO_INTENT}`)}
                  className="mt-4 inline-block border border-accent px-5 py-2.5 text-[13px] text-accent hover:bg-accent hover:text-bg transition"
                >
                  {en ? "Sign out and create a studio account →" : "サインアウトしてスタジオアカウントを作成 →"}
                </Link>
                <SignupRequirements en={en} needsDifferentAddress />
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
                ? "Company, property name and address are filled in from your listing. Tell us your preferred scan dates, a contact for the day, and anything else we should know — we'll shoot the 3D data and publish after a check."
                : "会社名・物件名・所在地は掲載ページの内容を入れてあります。スキャンの希望日・当日のご連絡先と、ご要望やご質問があれば本文にお書きください。3Dデータの撮影と確認のうえ公開します。"}
            </p>
            <p className="mt-2 mono text-[10px] text-muted">
              {en
                ? "Sending this form submits both your message and the publication request."
                : "この フォームを送信すると、お問い合わせ内容の送信と公開申請が同時に行われます。"}
            </p>
          </div>
        )}

        {/* ⚠ 掲載依頼(listing)のフォームは **公開申請のときだけ** 出す（?property= 付き）。
            掲載は「先に掲載ページを作る → 出来たら公開を申請する」という順番に
            一本化したので、ページを作る前にフォームだけ送られると、物件の実体が
            無い問い合わせが溜まって突き合わせられなくなる（2026-07-30 の方針）。
            申請フォームは問い合わせ本文も一緒に受け取り、送信時に
            contact-actions が requestPublishAction を呼んで
            **問い合わせと公開申請を同時に**成立させる。
            申請前の人には、上の導線カード（アカウント作成／掲載ページを作成）だけを見せる。 */}
        {t !== "listing" || prefill ? <ContactForm type={t} prefill={prefill} /> : null}
      </div>
    </div>
  );
}
