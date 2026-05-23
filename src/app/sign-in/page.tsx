import Link from "next/link";

export const metadata = { title: "ログイン / 新規登録" };

export default function SignInPage() {
  return (
    <div className="frame min-h-[72vh] flex items-center justify-center py-20">
      <div className="border border-line bg-[#070707] p-10 w-full max-w-md">
        {/* Tab-style switcher: this page is the "log in" tab, signup is its own page */}
        <div className="flex border-b border-line mb-6">
          <div className="flex-1 text-center py-2 border-b-2 border-accent text-accent mono text-[11px] tracking-[0.22em] uppercase">
            ログイン
          </div>
          <Link
            href="/sign-up"
            className="flex-1 text-center py-2 border-b-2 border-transparent text-muted hover:text-ink mono text-[11px] tracking-[0.22em] uppercase transition"
          >
            新規登録
          </Link>
        </div>

        <h1 className="serif text-3xl mb-3">おかえりなさい</h1>
        <p className="text-[12px] text-muted leading-[1.85] mb-8">
          本実装は <strong className="text-ink">Clerk</strong> による
          ソーシャルログイン / Magic link を予定。現在はプレースホルダー。
        </p>

        <button
          type="button"
          className="w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
          disabled
        >
          Google で続行（未接続）
        </button>
        <button
          type="button"
          className="mt-2 w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line opacity-70"
          disabled
        >
          Email Magic link（未接続）
        </button>

        <div className="mt-8 text-[12px] text-muted text-center">
          初めての方は{" "}
          <Link href="/sign-up" className="text-accent hover:underline">
            新規アカウントを作成 →
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-line mono text-[9px] tracking-[0.22em] uppercase opacity-40 text-center">
          dev demo: ?login=1 でログイン状態に切替
        </div>
      </div>
    </div>
  );
}
