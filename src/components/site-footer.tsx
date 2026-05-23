import Link from "next/link";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-32 border-t border-line">
      <div className="frame pt-16 pb-10 grid gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="serif text-2xl tracking-[0.04em] mb-3">ロケハン3D</div>
          <p className="text-sm text-muted max-w-[40ch] leading-relaxed">
            実空間を 3D 空間ごと持ち帰る。
            <br />
            ブラウザだけで撮影前ロケハン・現場検証・スタジオ検討を完結する
            オンラインプラットフォーム。
          </p>
        </div>

        <div>
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-muted mb-4">
            Product
          </div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/properties" className="hover:text-accent">物件を探す</Link></li>
            <li><Link href="/pricing" className="hover:text-accent">料金プラン</Link></li>
            <li><a href="https://viewer.locahun3d.com/Locahun3D_OfflineViewer" className="hover:text-accent" target="_blank" rel="noopener">オフラインビューアー</a></li>
          </ul>
        </div>

        <div>
          <div className="mono text-[10px] tracking-[0.32em] uppercase text-muted mb-4">
            Company
          </div>
          <ul className="space-y-2 text-sm">
            <li><a href="https://web.locahun3d.com/locahun3d_manifesto.html" className="hover:text-accent">マニフェスト</a></li>
            <li><a href="https://web.locahun3d.com/locahun3d_contact.html" className="hover:text-accent">お問い合わせ</a></li>
            <li><a href="https://web.locahun3d.com/locahun3d_privacy.html" className="hover:text-accent">プライバシー</a></li>
          </ul>
        </div>
      </div>

      <div className="frame border-t border-line pt-5 pb-6 flex flex-wrap justify-between items-center gap-2">
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
