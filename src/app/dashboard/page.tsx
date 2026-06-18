import Link from "next/link";

export const metadata = { title: "ダッシュボード" };

export default function DashboardPage() {
  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Dashboard</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-light">
          ようこそ、ゲスト
        </h1>
        <p className="text-[14px] text-muted mt-2">
          Clerk 接続後にユーザー情報・サブスク状態・ブックマークが表示されます。
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Plan</div>
          <div className="serif text-2xl">Free</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            3DGS ウォークスルーは未開放。
          </p>
          <Link
            href="/pricing"
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            アップグレード
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Bookmarks</div>
          <div className="serif text-2xl">0</div>
          <p className="text-[12px] text-muted mt-2 leading-[1.7]">
            気になる物件はブックマークに保存できます。
          </p>
          <Link
            href="/properties"
            className="mt-4 inline-block mono text-[11px] tracking-[0.22em] uppercase border border-line px-4 py-2 hover:border-ink transition"
          >
            物件を探す →
          </Link>
        </section>

        <section className="border border-line p-6">
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-50 mb-3">Recent</div>
          <p className="text-[12px] text-muted leading-[1.7]">
            最近見た物件・ウォークスルー履歴がここに並びます。
          </p>
        </section>
      </div>
    </div>
  );
}
