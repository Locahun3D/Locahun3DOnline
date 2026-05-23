import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * Dev-only admin gate.
 *
 * For production this will be replaced with Clerk role check:
 *   const { sessionClaims } = await auth();
 *   if (sessionClaims?.metadata?.role !== "admin") notFound();
 *
 * For now, set NEXT_PUBLIC_ADMIN_BYPASS=1 in .env.local (default in dev).
 */
function isAdminBypass(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_ADMIN_BYPASS === "1";
}

export const metadata = {
  title: { default: "Admin", template: "%s｜Admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAdminBypass()) notFound();

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[220px_1fr] border-t border-line">
      <aside className="border-r border-line p-6 bg-[#050505] sticky top-16 self-start">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-1">
          ● REC
        </div>
        <div className="serif text-lg mb-6">Admin</div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href="/admin/properties"
            className="px-3 py-2 hover:bg-[#0c0c0c] hover:text-accent transition rounded-sm"
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
