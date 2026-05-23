import Link from "next/link";

export const metadata = {
  title: "3D データ販売 (準備中)",
  description: "撮影者・スタジオが 3D Gaussian Splatting データを販売するマーケットプレイス。",
};

export default function MarketplacePage() {
  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">MARKETPLACE</span>
        <span>Sell your 3D scans</span>
        <span className="flex-1 h-px bg-current opacity-25" />
        <span className="opacity-60 text-accent">COMING SOON</span>
      </div>

      <header className="max-w-[60ch]">
        <h1 className="serif text-[clamp(2rem,4vw,3.4rem)] font-light leading-[1.3] mb-4">
          スキャンした空間を、
          <br />
          <em className="not-italic text-accent">資産</em> に。
        </h1>
        <p className="text-[15px] text-muted leading-[1.9]">
          PortalCam で撮影した 3DGS データを、ロケハン3D オンライン上で
          有償ライセンス販売できるマーケットプレイス機能を準備中です。
          Stripe Connect 連携で売上を直接受け取れます。
        </p>
      </header>

      <section className="mt-12 grid md:grid-cols-3 gap-6">
        {[
          {
            h: "1. アップロード",
            p: "撮影済の .splat / .ply を R2 へ。サムネイル・タグ・価格を設定。",
          },
          {
            h: "2. プレビュー販売",
            p: "購入前のユーザーには低品質プレビュー、購入後にフル品質を解放。",
          },
          {
            h: "3. 売上を受け取る",
            p: "Stripe Connect で直接入金。手数料は売上の 15%（予定）。",
          },
        ].map((it) => (
          <div key={it.h} className="border border-line p-6">
            <div className="serif text-lg mb-2">{it.h}</div>
            <p className="text-[13px] text-muted leading-[1.75]">{it.p}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 border border-accent p-8 text-center">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-3">
          Early access
        </div>
        <div className="serif text-2xl mb-4">先行販売パートナー募集中</div>
        <p className="text-[13px] text-muted leading-[1.85] max-w-[50ch] mx-auto mb-6">
          ローンチ時に掲載されるスタジオ・撮影者を優遇枠で募集。
          初期出品は手数料 50% OFF。
        </p>
        <Link
          href="https://web.locahun3d.com/locahun3d_contact.html"
          className="inline-block px-6 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          パートナー応募 →
        </Link>
      </section>
    </div>
  );
}
