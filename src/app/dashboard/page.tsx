import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { purchaseRepo } from "@/lib/purchases";
import { viewUnlockRepo } from "@/lib/view-unlocks";

export const metadata = { title: "ダッシュボード" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirect_url=/dashboard");

  const locale = await getLocale();
  const en = locale === "en";
  const lh = (href: string) => localizedHref(href, locale);

  const purchaseCount = (
    await purchaseRepo.list({ userId: user.id })
  ).filter((p) => p.status === "completed").length;

  const now = new Date().toISOString();
  const unlockedCount = (
    await viewUnlockRepo.list({ userId: user.id })
  ).filter((u) => u.expiresAt > now).length;

  const planLabel = user.plan === "free"
    ? (en ? "Free" : "無料")
    : user.plan.toUpperCase();

  return (
    <div className="theme-online frame pt-12 pb-12 sm:pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Dashboard</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {en ? `Welcome, ${user.name}` : `ようこそ、${user.name}`}
        </h1>
        <p className="text-[14px] text-muted mt-2">
          {en ? "Your account overview." : "アカウントの概要です。"}
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Plan</div>
          <div className="serif text-2xl">{planLabel}</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            {en
              ? "Manage your plan and token balance."
              : "プランとトークン残高はこちら。"}
          </p>
          <Link
            href={lh(user.plan === "free" ? "/pricing" : "/account")}
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {user.plan === "free"
              ? en ? "Upgrade" : "アップグレード"
              : en ? "Manage account" : "アカウント管理"}
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Unlocked scenes</div>
          <div className="serif text-2xl">{unlockedCount}</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            {en ? "3DGS scenes you can re-view free (1 year)." : "無償で再視聴できる3DGSシーン(1年間)。"}
          </p>
          <Link
            href={lh("/dashboard/unlocked")}
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
          >
            {en ? "Viewing history →" : "閲覧履歴 →"}
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Bookmarks</div>
          <div className="serif text-2xl">{user.bookmarks?.length ?? 0}</div>
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
          <div className="serif text-2xl">{purchaseCount}</div>
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
