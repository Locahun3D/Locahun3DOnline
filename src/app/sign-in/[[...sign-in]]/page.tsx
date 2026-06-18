import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";

export const metadata = { title: "ログイン" };

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

  return (
    <div className="frame min-h-[80vh] flex items-center justify-center py-16">
      <SignIn signUpUrl="/sign-up" />
    </div>
  );
}
