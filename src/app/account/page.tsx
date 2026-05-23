import Link from "next/link";

export const metadata = { title: "プロフィール" };

export default function AccountPage() {
  return (
    <div className="frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Profile</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-light">
          プロフィール
        </h1>
        <p className="text-[13px] text-muted mt-2">
          Clerk 配線後に実データに切替。今はダミー表示。
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        <section className="md:col-span-2 border border-line p-6 space-y-5">
          <div>
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              基本情報
            </div>
            <dl className="grid grid-cols-[110px_1fr] gap-y-3 text-[13px]">
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                氏名
              </dt>
              <dd>中村 航</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                Email
              </dt>
              <dd className="mono text-[11px]">nakamurakou1108@gmail.com</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                所属
              </dt>
              <dd>—</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                登録日
              </dt>
              <dd className="mono text-[11px]">2026-05-24</dd>
            </dl>
          </div>

          <div className="pt-5 border-t border-line">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
              利用中プラン
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="serif text-2xl">Individual</div>
                <div className="mono text-[10px] text-muted mt-1">
                  ¥5,200 / 月 · 次回更新 2026-06-24
                </div>
              </div>
              <Link
                href="/pricing"
                className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
              >
                プラン変更
              </Link>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="border border-line p-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              今月のトークン
            </div>
            <div className="serif text-3xl text-accent">8 / 8</div>
            <div className="mono text-[10px] text-muted mt-1">月初リセット</div>
            <div className="h-1 bg-line mt-3 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: "100%" }} />
            </div>
          </div>

          <div className="border border-line p-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              ブックマーク
            </div>
            <div className="serif text-3xl">0</div>
            <Link
              href="/properties"
              className="mt-3 inline-block mono text-[10px] tracking-[0.22em] uppercase text-accent hover:underline"
            >
              物件を探す →
            </Link>
          </div>
        </aside>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4 text-[12px]">
        <Link
          href="/account/billing"
          className="border border-line p-5 hover:border-accent hover:text-accent transition"
        >
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-1">
            💳 課金 / 領収書
          </div>
          <div className="text-[13px]">支払履歴・領収書ダウンロード</div>
        </Link>
        <Link
          href="/account/history"
          className="border border-line p-5 hover:border-accent hover:text-accent transition"
        >
          <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-1">
            🕒 視聴履歴
          </div>
          <div className="text-[13px]">3DGS を開いた物件と日時</div>
        </Link>
      </div>
    </div>
  );
}
