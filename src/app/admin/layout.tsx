import { requireAdminOrStudioOwner } from "@/lib/dal";
import AdminNav, { type AdminNavItem } from "@/components/admin/admin-nav";

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

  const navItems: AdminNavItem[] = [
    { href: "/admin/properties", label: "物件" },
    ...(isAdmin
      ? ([
          { href: "/admin/properties?status=draft", label: "↳ 下書きのみ", sub: true },
          { href: "/admin/properties?status=published", label: "↳ 公開中のみ", sub: true },
          { href: "/admin/accounts", label: "アカウント" },
          { href: "/admin/accounts?status=pending", label: "↳ 承認待ちのみ", sub: true },
          { href: "/admin/subscriptions", label: "↳ サブスク売上", sub: true },
          { href: "/admin/analytics", label: "アナリティクス" },
          { href: "/admin/assets", label: "アセット" },
          { href: "/admin/gift-codes", label: "ギフトコード・無料期間" },
          { href: "/admin/inquiries", label: "問い合わせ" },
          { href: "/admin/contact-requests", label: "お問い合わせ（サイト全体）" },
          { href: "/admin/marketing", label: "マーケティング" },
          { href: "/admin/reports", label: "通報管理" },
          { href: "/admin/purchases", label: "データ販売" },
        ] as AdminNavItem[])
      : []),
  ];

  return (
    <div className="theme-online min-h-screen grid grid-cols-1 md:grid-cols-[220px_1fr] border-t border-line">
      <aside className="border-r border-line p-6 bg-[#141414] sticky top-[calc(var(--header-h)/var(--z))] self-start">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-1">
          ● REC
        </div>
        <div className="serif text-lg mb-6">
          {isAdmin ? "Admin" : "Studio"}
        </div>
        <AdminNav items={navItems} />
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
