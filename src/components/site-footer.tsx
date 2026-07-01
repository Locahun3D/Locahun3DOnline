import Link from "next/link";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-32 border-t border-line">
      <div className="frame pt-8 pb-6 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted">
          © {year} ロケハン3D — 中村 航
        </div>
        <nav className="flex gap-4 mono text-[10px] tracking-[0.18em] uppercase text-muted">
          <Link href="/terms/tokushoho" className="hover:text-foreground transition">特定商取引法</Link>
          <Link href="/terms/data-download" className="hover:text-foreground transition">利用規約</Link>
        </nav>
      </div>

      <div
        aria-hidden
        className="absolute left-0 right-0 bottom-0 h-2"
        style={{
          backgroundImage: "linear-gradient(90deg, #000 50%, transparent 50%)",
          backgroundSize: "12px 8px",
          backgroundColor: "rgba(255,255,255,.04)",
        }}
      />
    </footer>
  );
}
