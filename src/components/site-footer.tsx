export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-32 border-t border-line">
      <div className="frame pt-8 pb-6 flex flex-wrap justify-between items-center gap-2">
        <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted">
          © {year} ロケハン3D — 中村 航
        </div>
        <div className="mono text-[10px] tracking-[0.28em] uppercase text-muted">
          v0.0.1 / online.locahun3d.com
        </div>
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
