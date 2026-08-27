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

/**
 * 受付中の窓口のうち、この汎用ページで扱うもの。
 * ⚠ scan（制作側スキャン依頼）は概算シミュレーターを併設する専用ページ
 *   `src/app/contact/scan/page.tsx` を持つ（静的セグメントが動的 [type] より
 *   優先されるのでここには来ない）。そのため Partial にして、
 *   COPY に無い種別は 404 で弾く。
 */
const COPY: Partial<
  Record<(typeof CONTACT_TYPES)[number], { title: string; titleEn: string; lede: string; ledeEn: string }>
> = {
  request: {
    title: "ほしい物件追加",
    titleEn: "Request a location",
    lede: "「こんな物件を3Dで見たい」というリクエストを、今後のスキャン対象の選定に活用します。",
    ledeEn: "Tell us what kind of location you'd like scanned — it feeds our future scan list.",
  },
  listing: {
    title: "掲載依頼",
    titleEn: "List your space",
    // ⚠ 費用の条件はすぐ下の ListingValue が大きな数字で示す。ここで重ねて
    //   書くと同じ話が3箇所（バッジ・リード文・カード）に出て冗長になる
    //   （2026-08-13 リデザインで整理）。
    lede: "物件を拝見し、担当者より掲載の流れ（3Dスキャン・撮影・公開）をご案内します。",
    ledeEn: "We'll review your space and walk you through listing it — 3D scan, shoot, then publish.",
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

/**
 * 掲載までの流れ（3ステップ）。
 *
 * ── 2026-08-13 リデザイン ──────────────────────────────────
 * 以前は各アクションカードの下に 10px の1行プレビューとして畳まれており、
 * 「今どこにいて、次に何が起きるか」が読み取りにくかった（「細々していて
 * 見づらい」との指摘）。独立したセクションに引き上げ、各ステップに1行の
 * 説明を添えて、現在地をカードの塗りで示す。current は 1〜3。
 */
function ListingSteps({ en, current }: { en: boolean; current: 1 | 2 | 3 }) {
  const steps = en
    ? [
        { t: "Studio account", d: "Free, no review" },
        { t: "Create listing page", d: "Everything except the 3D scan" },
        { t: "Request publication", d: "We scan, check, then publish" },
      ]
    : [
        { t: "アカウント作成", d: "無料・審査なし" },
        { t: "掲載ページを作成", d: "3Dスキャン以外を入力" },
        { t: "公開を申請", d: "撮影・確認のうえ公開" },
      ];
  return (
    <section className="mb-8">
      <h2 className="text-[17px] font-bold mb-4">
        {en ? "How it works" : "掲載までの流れ"}
      </h2>
      <ol className="grid sm:grid-cols-3 gap-3">
        {steps.map((s, i) => {
          const n = i + 1;
          const active = n === current;
          const done = n < current;
          return (
            <li
              key={s.t}
              className={`border px-5 py-4 ${
                active ? "border-accent bg-accent/[0.06]" : "border-line bg-white"
              }`}
            >
              <div
                className={`mono text-[10px] tracking-[0.24em] uppercase mb-2 ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {done ? `✓ 0${n}` : `0${n}`}
              </div>
              <div
                className={`text-[14px] font-bold leading-[1.6] mb-1 ${
                  active ? "text-accent" : ""
                }`}
              >
                {s.t}
              </div>
              <p className="text-[12.5px] text-muted leading-[1.8]">{s.d}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
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
  // 専用ページを持つ種別（scan）はここに落ちてこないが、来た場合は404にする。
  if (!copy) notFound();

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

  // 掲載までの3ステップの現在地。下のアクションカードの分岐と 1:1 で対応させること
  // （ここがズレると「今どこにいるか」の表示だけが嘘になる）。
  const listingStep: 1 | 2 | 3 = prefill ? 3 : canOwn ? 2 : 1;

  return (
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">CONTACT</span>
        <span>{en ? copy.titleEn : copy.title}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      {/* 掲載依頼は費用カード・流れ・登録条件と横並びの情報が多く、620px だと
          どのブロックも2〜3行に折り返して「細々」して見えた。この種別だけ
          お問い合わせハブ(/contact)と同じ 760px に広げる（2026-08-13）。 */}
      <div className={`${t === "listing" ? "max-w-[760px]" : "max-w-[620px]"} mx-auto`}>
        <Link
          href={lh("/contact")}
          className="text-[12px] text-muted hover:text-accent transition max-[720px]:inline-flex max-[720px]:items-center max-[720px]:min-h-[44px]"
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
            {en ? "Listing is always free" : "掲載費はずっと無料"}
          </div>
        )}
        <p className="text-[14px] text-muted leading-[1.9] mb-10">
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

        {/* 流れは分岐カードの外に独立させる。以前は各カードの下に 10px の
            1行プレビューとして畳まれていて全体像が掴めなかった。 */}
        {t === "listing" && <ListingSteps en={en} current={listingStep} />}

        {t === "listing" && !prefill && (
          <div className="mb-10 border border-accent/40 bg-white p-6 sm:p-7">
            {!user ? (
              <>
                <h2 className="text-[18px] font-bold mb-2.5">
                  {en ? "Create a studio account" : "まずスタジオ用アカウントを作成"}
                </h2>
                <p className="text-[13.5px] leading-[1.9] text-muted">
                  {en
                    ? "Listings are created from a studio account. Sign up (free, no review) and you can start a listing page right away — we handle the 3D scan."
                    : "掲載ページはスタジオ用アカウントから作成します。登録は無料・審査なしで、"}
                  {!en && <br className="pc" />}
                  {!en && "すぐに掲載ページを作り始められます。3Dスキャンはこちらで対応します。"}
                </p>
                <Link
                  href={lh(`/sign-up?intent=${STUDIO_INTENT}`)}
                  className="mt-5 inline-block bg-accent text-white px-6 py-3 text-[14px] font-bold hover:bg-accent/85 transition"
                >
                  {en ? "Create a studio account →" : "スタジオアカウントを作成 →"}
                </Link>
                <SignupRequirements en={en} />
              </>
            ) : canOwn ? (
              <>
                <h2 className="text-[18px] font-bold mb-2.5">
                  {en ? "Create the listing page" : "物件の掲載ページを作成"}
                </h2>
                <p className="text-[13.5px] leading-[1.9] text-muted">
                  {en
                    ? "Fill in everything except the 3D scan — we shoot that. When you're done, the editor takes you here to request publication."
                    : "3Dスキャン以外の情報を入力してください（撮影はこちらで行います）。"}
                  {!en && <br className="pc" />}
                  {!en && "入力が終わったら、エディターからこのページに戻って公開を申請します。"}
                </p>
                <Link
                  href={lh("/admin/properties")}
                  className="mt-5 inline-block bg-accent text-white px-6 py-3 text-[14px] font-bold hover:bg-accent/85 transition"
                >
                  {en ? "Go to listing pages →" : "掲載ページを作成する →"}
                </Link>
              </>
            ) : canConvert ? (
              <>
                {/* 会社ドメインのメールでログイン済み。新規登録に送っても Clerk が
                    サインアップ画面を出さずマイページへ弾くうえ、撮影スタジオは
                    元々自己申告で選べる種別なので、このまま切り替える。 */}
                <h2 className="text-[18px] font-bold mb-2.5">
                  {en ? "Switch this account to a studio account" : "このアカウントをスタジオアカウントにする"}
                </h2>
                <p className="text-[13.5px] leading-[1.9] text-muted">
                  {en
                    ? `You're signed in with a company address (${user?.email}). No second account needed — switch this one to a studio account and start a listing page right away.`
                    : `会社のメールアドレス（${user?.email}）でログイン中です。別のアカウントを作る必要はありません。このアカウントをスタジオアカウントに切り替えると、すぐに掲載ページを作り始められます。`}
                </p>
                <form action={convertToStudioAction}>
                  <button className="mt-5 inline-block bg-accent text-white px-6 py-3 text-[14px] font-bold hover:bg-accent/85 transition cursor-pointer">
                    {en ? "Switch to a studio account →" : "スタジオアカウントに切り替える →"}
                  </button>
                </form>
                <p className="mt-3 text-[12.5px] text-muted leading-[1.8]">
                  {en
                    ? "Free, no review. Viewing and purchases stay exactly as they are."
                    : "無料・審査なし。閲覧や購入の履歴はそのまま引き継がれます。"}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-[18px] font-bold mb-2.5">
                  {en ? "A studio account is required" : "スタジオ用アカウントが必要です"}
                </h2>
                <p className="text-[13.5px] leading-[1.9] text-muted">
                  {en
                    ? "Your current account type cannot create listings. Sign up separately as a studio — it's free and takes effect immediately."
                    : "現在のアカウント種別では掲載ページを作成できません。"}
                  {!en && <br className="pc" />}
                  {!en && "スタジオ用に別途アカウントをご登録ください（無料・登録後すぐ利用可）。"}
                </p>
                {/* ⚠ ログイン中に /sign-up へ送っても Clerk がサインアップ画面を出さず
                    マイページへ弾く（ユーザー報告）。先にサインアウトしてから
                    登録画面へ着地させる。 */}
                <Link
                  href={lh(`/sign-out?redirect=/sign-up%3Fintent=${STUDIO_INTENT}`)}
                  className="mt-5 inline-block bg-accent text-white px-6 py-3 text-[14px] font-bold hover:bg-accent/85 transition"
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
          <div className="mb-8 border border-accent/40 bg-accent/5 p-6 sm:p-7">
            <h2 className="text-[18px] font-bold mb-2.5 leading-[1.5]">
              {en ? `Request publication: ${prefill.propertyName}` : `公開を申請: ${prefill.propertyName}`}
            </h2>
            <p className="text-[13.5px] leading-[1.9] text-muted">
              {en
                ? "Company, property name and address are filled in from your listing. Tell us your preferred scan dates, a contact for the day, and anything else we should know — we'll shoot the 3D data and publish after a check."
                : "会社名・物件名・所在地は掲載ページの内容を入れてあります。スキャンの希望日・当日のご連絡先と、ご要望やご質問があれば本文にお書きください。3Dデータの撮影と確認のうえ公開します。"}
            </p>
            <p className="mt-3 text-[12.5px] text-muted leading-[1.8]">
              {en
                ? "Sending this form submits both your message and the publication request."
                : "このフォームを送信すると、お問い合わせ内容の送信と公開申請が同時に行われます。"}
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
