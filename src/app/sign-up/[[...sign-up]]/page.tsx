import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import InAppBrowserWarning from "@/components/in-app-browser-warning";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Sign up" : "新規登録" };
}

export default async function SignUpPage() {
  // Already signed in (e.g. via the browser Back button)? Don't show the form —
  // leave via a server redirect so the history stack can't get trapped.
  if (await getCurrentUser()) redirect("/account");

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  return (
    // ログイン側と同じ2カラム。カードだけを中央に浮かせると、広い画面で
    // 真っ黒な余白に小さなカードが1枚あるだけの画面になり、登録する理由が
    // 何も伝わらない（実機で確認して作り直した）。
    <div className="frame py-10 sm:py-20">
      <InAppBrowserWarning locale={locale} />
      {/* 2カラムは 1200px 以上のみ（理由は /sign-in と同じ。両ページ同時に変更すること） */}
      <div className="mx-auto grid w-full max-w-[880px] items-center gap-10 min-[1200px]:grid-cols-[1fr_auto] min-[1200px]:gap-16">
        <div className="max-w-[34ch] min-[768px]:max-[1200px]:mx-auto">
          <p className="mono text-[11px] tracking-[0.24em] text-muted uppercase">Get started</p>
          <h1 className="mt-3 text-2xl sm:text-3xl leading-snug font-bold">
            {en ? (
              <>
                Scout the location
                <br />
                from your desk.
              </>
            ) : (
              <>
                ロケハンを、
                <br />
                机の上から。
              </>
            )}
          </h1>
          <ul className="mt-6 space-y-2 text-[13px] leading-relaxed text-muted">
            {(en
              ? [
                  "Free account — browse the catalogue right away",
                  "Walk, measure and check daylight in the browser",
                  "Upgrade only when you need more scenes",
                ]
              : [
                  "無料アカウントでカタログをすぐ閲覧",
                  "ブラウザで歩く・測る・光を見る",
                  "もっと見たくなってからのアップグレードで大丈夫",
                ]
            ).map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-accent">
                  —
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-center gap-4 justify-self-center min-[1200px]:justify-self-end">
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
      </div>
    </div>
  );
}
