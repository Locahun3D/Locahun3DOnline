import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import OnboardingForm from "@/components/onboarding-form";
import { defaultOnboardingRole, isStudioIntent } from "@/lib/listing-funnel";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Account Setup" : "アカウント設定" };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const user = await requireUser();
  // ⚠ 以前はここで無言に /account へ戻していたため、「スタジオアカウントを
  //   作ろうとしたのに、何も言われずマイページに戻される」という状態だった。
  //   必ず理由を渡す（/account 側の notice で文言を出す）。
  if (user.onboarded || user.role === "admin") {
    redirect("/account?notice=already-onboarded");
  }
  const en = (await getLocale()) === "en";

  return (
    <div className="theme-online frame min-h-[calc(72vh/var(--z))] flex items-center justify-center py-16">
      <div className="border border-line bg-[#222] p-10 w-full max-w-md">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
          WELCOME
        </div>
        <h1 className="serif text-3xl mb-2">{en ? "Choose your account type" : "アカウント種別を選択"}</h1>
        {/* 掲載側として来た人には、なぜ撮影スタジオが選ばれているかを明示する。 */}
        {isStudioIntent(intent) && (
          <p className="border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent leading-[1.7] mb-4">
            {en
              ? "You came from the listing flow, so “Filming studio” is preselected. Change it if that's not right."
              : "掲載のご依頼から来られたので「撮影スタジオ」を選んであります。違う場合は変更してください。"}
          </p>
        )}
        <p className="text-[12px] text-muted leading-[1.85] mb-7">
          {en
            ? `Welcome, ${user.name}. Pick the type that matches how you'll use the service. You can change it later by contacting our team.`
            : `ようこそ、${user.name} さん。利用形態に合わせて種別を選んでください。後から運営に相談して変更も可能です。`}
        </p>
        <OnboardingForm defaultRole={defaultOnboardingRole(intent)} />
      </div>
    </div>
  );
}
