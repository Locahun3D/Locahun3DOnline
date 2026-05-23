import Link from "next/link";

const NAV = [
  { href: "/properties", label: "物件を探す", code: "0.1" },
  { href: "/pricing", label: "料金", code: "0.2" },
  { href: "/marketplace", label: "3Dデータ販売", code: "0.3" },
  { href: "/about", label: "サービスについて", code: "0.4" },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-sm">
      <div className="frame flex items-center justify-between h-16">
        <Link
          href="/"
          className="flex items-baseline gap-3 group"
          aria-label="ロケハン3D オンライン トップへ"
        >
          <span className="mono text-[10px] tracking-[0.32em] uppercase text-muted">
            REC ●
          </span>
          <span className="serif text-lg tracking-[0.08em] font-normal">
            ロケハン3D
          </span>
          <span className="mono text-[10px] tracking-[0.24em] uppercase text-muted hidden sm:inline">
            / ONLINE
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="group flex items-center gap-2 text-[13px] font-light text-muted hover:text-ink transition-colors"
            >
              <span className="mono text-[10px] tracking-[0.2em] opacity-50 group-hover:text-accent group-hover:opacity-100 transition">
                {n.code}
              </span>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden sm:inline-block px-3 py-1.5 text-[12px] mono tracking-[0.18em] uppercase text-muted hover:text-ink transition"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="px-4 py-1.5 text-[12px] mono tracking-[0.2em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          >
            Get started
          </Link>
          {process.env.NODE_ENV !== "production" && (
            <Link
              href="/admin"
              title="Dev only"
              className="hidden md:inline-block px-3 py-1.5 text-[10px] mono tracking-[0.22em] uppercase text-muted border-l border-line ml-2 pl-3 hover:text-accent transition"
            >
              ⚙ Admin
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
