import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import InAppBrowserWarning from "@/components/in-app-browser-warning";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Sign in" : "ログイン" };
}

/** Strip to a same-site path so an attacker can't redirect off-site. */
function internalPath(raw?: string): string {
  if (!raw) return "/";
  try {
    return new URL(raw, "http://x").pathname || "/";
  } catch {
    return raw.startsWith("/") ? raw : "/";
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  // Already signed in (e.g. arrived here via the browser Back button)? Leave at
  // once via a server redirect — never render the form, so Clerk's client-side
  // "already authenticated" bounce can't trap the history stack.
  if (await getCurrentUser()) {
    const { redirect_url } = await searchParams;
    redirect(internalPath(redirect_url));
  }

  const locale = await getLocale();

  const en = locale === "en";

  return (
    // ⚠ 以前はカードだけを縦センタリングしていたため、広い画面で
    // 「真っ黒な余白に小さなカードが1枚浮いている」状態になり、
    // ブランドも入会理由も何も伝わらない画面になっていた。
    // 見出し＋要点を左に置いた2カラムにして、カードに文脈を与える。
    <div className="frame py-10 sm:py-20">
      <InAppBrowserWarning locale={locale} />
      <div className="mx-auto grid w-full max-w-[880px] items-center gap-10 md:grid-cols-[1fr_auto] md:gap-16">
        <div className="max-w-[34ch]">
          <p className="mono text-[11px] tracking-[0.24em] text-muted uppercase">Account</p>
          <h1 className="mt-3 text-2xl sm:text-3xl leading-snug font-bold">
            {en ? (
              <>
                Walk the location
                <br />
                before you go.
              </>
            ) : (
              <>
                現場に行く前に、
                <br />
                歩いて確かめる。
              </>
            )}
          </h1>
          <ul className="mt-6 space-y-2 text-[13px] leading-relaxed text-muted">
            {(en
              ? [
                  "Walk, measure and check daylight in the browser",
                  "Share the same space with your team",
                  "No app install required",
                ]
              : [
                  "ブラウザで歩く・測る・光を見る",
                  "同じ空間をチームでそのまま共有",
                  "アプリのインストールは不要",
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
        <div className="justify-self-center md:justify-self-end">
          <SignIn signUpUrl="/sign-up" />
        </div>
      </div>
    </div>
  );
}
