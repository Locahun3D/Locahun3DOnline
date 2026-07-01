import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);
  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Dashboard</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {en ? "Welcome, guest" : "ようこそ、ゲスト"}
        </h1>
        <p className="text-[14px] text-muted mt-2">
          {en
            ? "Your account, subscription status and bookmarks appear here once Clerk is connected."
            : "Clerk 接続後にユーザー情報・サブスク状態・ブックマークが表示されます。"}
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Plan</div>
          <div className="serif text-2xl">Free</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            {en ? "3DGS walkthrough not unlocked." : "3DGS ウォークスルーは未開放。"}
          </p>
          <Link
            href={lh("/pricing")}
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Upgrade" : "アップグレード"}
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Bookmarks</div>
          <div className="serif text-2xl">0</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            {en ? "Save locations you like with ★." : "気になる物件は ★ で保存できます。"}
          </p>
          <Link
            href={lh("/dashboard/bookmarks")}
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
          >
            {en ? "Saved locations →" : "保存した物件 →"}
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Purchases</div>
          <div className="serif text-2xl">—</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            {en ? "Your 3DGS data purchases & receipts." : "3DGSデータの購入履歴・領収書はこちら。"}
          </p>
          <Link
            href={lh("/dashboard/purchases")}
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
          >
            {en ? "Purchase history →" : "購入履歴 →"}
          </Link>
        </section>
      </div>
    </div>
  );
}
