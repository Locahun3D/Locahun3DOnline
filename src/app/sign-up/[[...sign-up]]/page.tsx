import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";

export const metadata = { title: "新規登録" };

export default async function SignUpPage() {
  // Already signed in (e.g. via the browser Back button)? Don't show the form —
  // leave via a server redirect so the history stack can't get trapped.
  if (await getCurrentUser()) redirect("/account");

  return (
    <div className="frame min-h-[80vh] flex items-center justify-center py-16">
      {/* New sign-ups go to /onboarding to pick account type + accept NDA. */}
      <SignUp signInUrl="/sign-in" forceRedirectUrl="/onboarding" />
    </div>
  );
}
