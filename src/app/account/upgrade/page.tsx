import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { isFreeEmailDomain } from "@/lib/free-email-domains";
import ProductionUpgradeForm from "@/components/production-upgrade-form";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Production Account Application" : "制作会社アカウントの申請" };
}

export default async function ProductionUpgradePage() {
  const user = await requireOnboarded();
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  if (user.role === "production" || user.role === "admin") {
    redirect(lh("/account?notice=already-production"));
  }

  return (
    <div className="theme-online frame min-h-[calc(72vh/var(--z))] flex items-center justify-center py-16">
      <div className="border border-line bg-[#222] p-10 w-full max-w-md">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
          TEAM PLAN
        </div>
        <h1 className="serif text-3xl mb-2">
          {en ? "Apply for a Production account" : "制作会社アカウントを申請"}
        </h1>
        <p className="text-[12px] text-muted leading-[1.85] mb-7">
          {en
            ? "Team's NDA / restricted-scene viewing is available only to Production accounts. Submit your company details and NDA agreement below — our team reviews and approves requests."
            : "TeamプランのNDA / 制限あり閲覧は「制作会社」アカウント限定です。会社情報とNDA同意を送信してください。運営が確認のうえ承認します。"}
        </p>

        {user.status === "pending" ? (
          <div className="border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-300">
            {en
              ? "Your account is already under review. We'll email you once it's approved."
              : "すでに審査中です。承認され次第ご連絡します。"}
          </div>
        ) : isFreeEmailDomain(user.email) ? (
          // NDA締結の裏付けとして会社メールドメインを必須化。個人メールの
          // アカウントにはフォーム自体を出さず、理由と対処を先に伝える。
          <div className="border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-300 leading-[1.8]">
            {en ? (
              <>
                Production (NDA) accounts require a company email address. Personal addresses
                such as Gmail, Outlook or Yahoo Mail can&apos;t apply. Please register a company
                email as your account&apos;s primary address (via your account settings) and try
                again.
              </>
            ) : (
              <>
                制作会社（NDA）アカウントの登録には会社のメールアドレスが必要です。Gmail・
                Outlook・Yahooメールなどの個人向けメールアドレスでは申請できません。アカウント
                設定でメインのメールアドレスを会社ドメインのものに変更のうえ、再度お試しください。
              </>
            )}
          </div>
        ) : (
          <ProductionUpgradeForm />
        )}

        <div className="mt-6 text-center">
          <Link
            href={lh("/account")}
            className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 hover:opacity-100 transition"
          >
            {en ? "← Back to account" : "← アカウントに戻る"}
          </Link>
        </div>
      </div>
    </div>
  );
}
