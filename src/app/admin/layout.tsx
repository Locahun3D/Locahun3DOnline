import { requireAdminOrStudioOwner } from "@/lib/dal";
import AdminNav, { type AdminNavGroup } from "@/components/admin/admin-nav";
import { getNotificationSummary } from "@/lib/notifications";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";

export const metadata = {
  title: { default: "Admin", template: "%s｜Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminOrStudioOwner();
  const isAdmin = user.role === "admin";
  const locale = await getLocale();
  const adminUnread = isAdmin ? (await getNotificationSummary(user.id, "admin", 0)).unreadCount : 0;

  // 2026-09-20: 14 本の平たいメニューを 4 つのまとまりに整理（admin-nav.tsx の説明を参照）。
  // 絞り込み用のサブリンク（下書きのみ／承認待ちのみ 等）は、各ページ内のタブと重複するので外した。
  // サブスク売上はアナリティクスの一部なので「売上」に並べる。ギフトコードはマーケティング内（#gift-codes）。
  const groups: AdminNavGroup[] = isAdmin
    ? [
        { title: "物件", items: [
          { href: "/admin/properties", label: "物件一覧" },
          { href: "/admin/assets", label: "アセット" },
          { href: "/admin/workflow", label: "下書きデータ転送" },
          { href: "/admin/submissions", label: "持ち込みスキャン" },
        ] },
        { title: "連絡", items: [
          { href: localizedHref("/admin/notifications", locale), label: locale === "en" ? "Notifications" : "通知", badge: adminUnread },
          { href: "/admin/inquiries", label: "スタジオ宛の問い合わせ" },
          { href: "/admin/contact-requests", label: "サイトへの問い合わせ" },
        ] },
        { title: "売上", items: [
          { href: "/admin/purchases", label: "データ販売" },
          { href: "/admin/subscriptions", label: "サブスク売上" },
          { href: "/admin/payouts", label: "精算" },
          { href: "/admin/analytics", label: "アナリティクス" },
        ] },
        { title: "運営", items: [
          { href: "/admin/accounts", label: "アカウント" },
          { href: "/admin/marketing", label: "マーケティング" },
          { href: "/admin/works", label: "実績＆技術ブログ" },
        ] },
      ]
    : [{ title: "物件", items: [{ href: "/admin/properties", label: "物件一覧" }] }];

  return (
    <div className="theme-online min-h-screen grid grid-cols-1 grid-rows-[auto_1fr] lg:grid-rows-1 lg:grid-cols-[208px_1fr] border-t border-line">
      <AdminNav groups={groups} heading={isAdmin ? "Admin" : "Studio"} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
