import Link from "next/link";
import { requireAdmin } from "@/lib/dal";

export const metadata = {
  title: { default: "Admin", template: "%s｜Admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Real gate: redirects non-admins (proxy.ts also blocks at the edge).
  await requireAdmin();

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[220px_1fr] border-t border-line">
      <aside className="border-r border-line p-6 bg-[#141414] sticky top-16 self-start">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-1">
          ● REC
        </div>
        <div className="serif text-lg mb-6">Admin</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href="/admin/properties"
            className="px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            物件
          </Link>
          <Link
            href="/admin/properties?status=draft"
            className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
          >
            ↳ 下書きのみ
          </Link>
          <Link
            href="/admin/properties?status=published"
            className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
          >
            ↳ 公開中のみ
          </Link>
          <Link
            href="/admin/accounts"
            className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            アカウント
          </Link>
          <Link
            href="/admin/accounts?status=pending"
            className="pl-6 py-1.5 text-[12px] text-muted hover:text-ink transition"
          >
            ↳ 承認待ちのみ
          </Link>
          <Link
            href="/admin/analytics"
            className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            アナリティクス
          </Link>
          <Link
            href="/admin/assets"
            className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            アセット
          </Link>
          <Link
            href="/admin/gift-codes"
            className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            ギフトコード
          </Link>
          <Link
            href="/admin/free-period"
            className="mt-1 px-3 py-2 hover:bg-[#262626] hover:text-accent transition rounded-sm"
          >
            限定無料期間
          </Link>
        </nav>

        <div className="mt-10 pt-6 border-t border-line text-[11px] text-muted leading-[1.7]">
          <div className="mono text-[9px] tracking-[0.28em] uppercase opacity-60 mb-1">
            データ
          </div>
          <p>
            編集内容は{" "}
            <code className="mono opacity-80">data/properties.json</code> に
            保存され、git に commit & push してデプロイで本番反映されます。
          </p>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
