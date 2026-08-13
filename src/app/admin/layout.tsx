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
          { href: "/admin/analytics", label: "アナリティクス" },
          { href: "/admin/subscriptions", label: "↳ サブスク売上", sub: true },
          { href: "/admin/assets", label: "アセット" },
          { href: "/admin/inquiries", label: "スタジオへのお問い合わせ" },
          { href: "/admin/contact-requests", label: "お問い合わせ（サイト全体）" },
          { href: "/admin/reports", label: "↳ 通報管理", sub: true },
          { href: "/admin/marketing", label: "マーケティング" },
          // ギフトコードは専用ページ(/admin/gift-codes)を廃止しマーケティング配下へ統合。
          // 全物件共通の「限定無料期間」UIも同時に廃止（無料化は3DGSデータごとに
          // 物件エディターで設定する運用に一本化したため）。
          // サイドバーの「↳ ギフトコード」リンクも 2026-08-13 に撤去。マーケティング
          // ページを少しスクロールすれば同じ場所（#gift-codes）に着くため、
          // 一段深いだけの重複リンクだった（運用担当の指摘）。
          { href: "/admin/purchases", label: "データ販売" },
          { href: "/admin/submissions", label: "持ち込みスキャン" },
          { href: "/admin/payouts", label: "精算" },
        ] as AdminNavItem[])
      : []),
  ];

  return (
    <div className="theme-online min-h-screen grid grid-cols-1 md:grid-cols-[220px_1fr] border-t border-line">
      <aside className="border-r border-line p-6 bg-[#141414] sticky top-[calc(var(--header-h)/var(--z))] self-start">
        <div className="serif text-lg mb-6">
          {isAdmin ? "Admin" : "Studio"}
        </div>
        <AdminNav items={navItems} />
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
