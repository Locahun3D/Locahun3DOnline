import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import InAppBrowserWarning from "@/components/in-app-browser-warning";

export const metadata = { title: "新規登録" };

export default async function SignUpPage() {
  // Already signed in (e.g. via the browser Back button)? Don't show the form —
  // leave via a server redirect so the history stack can't get trapped.
  if (await getCurrentUser()) redirect("/account");

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    <div className="frame min-h-[80vh] flex flex-col items-center justify-center gap-4 py-16">
      <InAppBrowserWarning locale={locale} />
      {/* New sign-ups go to /onboarding to pick account type + accept NDA. */}
      <SignUp signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
      {/* 明示的な同意チェックボックスは Clerk ウィジェット内には差し込めないため、
          多くの SaaS と同じ「続行=同意」形式の告知文をウィジェット直下に表示する。 */}
      <p className="max-w-sm text-center text-[12px] text-muted leading-relaxed">
        {en ? (
          <>
            By creating an account, you agree to our{" "}
            <Link href={lh("/terms/service")} className="text-accent hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href={lh("/privacy")} className="text-accent hover:underline">
              Privacy Policy
            </Link>
            .
          </>
        ) : (
          <>
            アカウントを作成すると、
            <Link href={lh("/terms/service")} className="text-accent hover:underline">
              利用規約
            </Link>
            および
            <Link href={lh("/privacy")} className="text-accent hover:underline">
              プライバシーポリシー
            </Link>
            に同意したものとみなされます。
          </>
        )}
      </p>
    </div>
  );
}
