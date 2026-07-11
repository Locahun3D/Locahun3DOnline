import Link from "next/link";
import { requireAdminOrStudioOwner } from "@/lib/dal";

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

  return (
    <div className="theme-online min-h-screen grid grid-cols-1 md:grid-cols-[220px_1fr] border-t border-line">
      <aside className="border-r border-line p-6 bg-[#141414] sticky top-16 self-start">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-1">
          ● REC
        </div>
        <div className="serif text-lg mb-6">
          {isAdmin ? "Admin" : "Studio"}
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href="/admin/properties"
            prefetch={false}
            className="px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            物件
          </Link>
          {isAdmin && (
            <>
              <Link
                href="/admin/properties?status=draft"
                prefetch={false}
                className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
              >
                ↳ 下書きのみ
              </Link>
              <Link
                href="/admin/properties?status=published"
                prefetch={false}
                className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
              >
                ↳ 公開中のみ
              </Link>
              <Link
                href="/admin/accounts"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                アカウント
              </Link>
              <Link
                href="/admin/accounts?status=pending"
                prefetch={false}
                className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
              >
                ↳ 承認待ちのみ
              </Link>
              <Link
                href="/admin/analytics"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                アナリティクス
              </Link>
              <Link
                href="/admin/assets"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                アセット
              </Link>
              <Link
                href="/admin/gift-codes"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                ギフトコード・無料期間
              </Link>
              <Link
                href="/admin/inquiries"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                問い合わせ
              </Link>
              <Link
                href="/admin/marketing"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                マーケティング
              </Link>
              <Link
                href="/admin/reports"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                通報管理
              </Link>
              <Link
                href="/admin/purchases"
                prefetch={false}
                className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
              >
                データ販売
              </Link>
              <Link
                href="/admin/pricing"
                prefetch={false}
                className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
              >
                ↳ 価格管理
              </Link>
            </>
          )}
        </nav>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
