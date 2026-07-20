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

  return (
    // サインアップ側と同じ理由でスマホは上寄せ＋余白控えめ（縦センタリングだと
    // カードが宙に浮き、上下に大きな死に領域ができる）。
    <div className="frame min-h-[calc(60vh/var(--z))] sm:min-h-[calc(80vh/var(--z))] flex flex-col items-center justify-start sm:justify-center py-8 sm:py-16">
      <InAppBrowserWarning locale={locale} />
      <SignIn signUpUrl="/sign-up" />
    </div>
  );
}
