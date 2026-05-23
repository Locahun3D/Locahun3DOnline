import Link from "next/link";

export default function NotFound() {
  return (
    <div className="frame min-h-[70vh] flex flex-col items-center justify-center text-center py-20">
      <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
        NO SIGNAL — 404
      </div>
      <h1 className="serif text-[clamp(2.4rem,6vw,5rem)] font-light leading-[1.2]">
        フレームが見つかりません。
      </h1>
      <p className="mt-6 text-[14px] text-muted max-w-[40ch] leading-[1.85]">
        探そうとしている画面は、ロケ地が変わったか、まだ撮影されていません。
      </p>
      <Link
        href="/"
        className="mt-10 px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
      >
        トップへ戻る
      </Link>
    </div>
  );
}
