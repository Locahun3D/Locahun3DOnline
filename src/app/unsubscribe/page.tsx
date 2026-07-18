import Link from "next/link";
import { userRepo } from "@/lib/users";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Unsubscribe" : "配信停止", robots: { index: false, follow: false } };
}

/**
 * ログイン不要のワンクリック配信停止。メール本文のリンクから直接ここへ来る前提
 * （サインインを挟むと「面倒だから放置」でオプトアウトできない苦情の元になる）。
 * u=userId, t=unsubscribeToken の完全一致でのみ解除する（総当たり防止に十分な
 * 長さのランダムトークンであることが前提 — crypto.randomUUID() 由来）。
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string }>;
}) {
  const { u, t } = await searchParams;
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  let result: "done" | "already" | "invalid" = "invalid";
  if (u && t) {
    const user = await userRepo.get(u);
    if (user && user.unsubscribeToken && user.unsubscribeToken === t) {
      if (user.marketingConsent) {
        await userRepo.upsert({ ...user, marketingConsent: false, marketingConsentAt: null });
        result = "done";
      } else {
        result = "already";
      }
    }
  }

  return (
    <div className="theme-online frame min-h-[calc(60vh/var(--z))] flex items-center justify-center py-16">
      <div className="max-w-md text-center px-6">
        <h1 className="serif text-2xl font-bold mb-4">
          {en ? "Email preferences" : "配信設定"}
        </h1>
        {result === "done" && (
          <p className="text-[14px] text-muted leading-[1.85]">
            {en
              ? "You've been unsubscribed from marketing emails. You won't receive any more unless you opt back in from your account page."
            : "お知らせメールの配信を停止しました。再度受け取りたい場合はマイページから設定を変更してください。"}
          </p>
        )}
        {result === "already" && (
          <p className="text-[14px] text-muted leading-[1.85]">
            {en ? "You're already unsubscribed." : "既に配信停止済みです。"}
          </p>
        )}
        {result === "invalid" && (
          <p className="text-[14px] text-muted leading-[1.85]">
            {en
              ? "This link is invalid or has expired."
              : "このリンクは無効です。"}
          </p>
        )}
        <Link
          href={lh("/")}
          className="inline-block mt-8 mono text-[11px] tracking-[0.22em] uppercase border border-line px-5 py-2.5 hover:border-accent hover:text-accent transition"
        >
          {en ? "← Back to top" : "← トップに戻る"}
        </Link>
      </div>
    </div>
  );
}
