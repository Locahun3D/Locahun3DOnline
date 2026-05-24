import Link from "next/link";

export const metadata = { title: "新規登録" };

export default function SignUpPage() {
  return (
    <div className="frame min-h-[72vh] flex items-center justify-center py-20">
      <div className="border border-line bg-[#222] p-10 w-full max-w-md">
        <div className="flex border-b border-line mb-6">
          <Link
            href="/sign-in"
            className="flex-1 text-center py-2 border-b-2 border-transparent text-muted hover:text-ink mono text-[11px] tracking-[0.22em] uppercase transition"
          >
            ログイン
          </Link>
          <div className="flex-1 text-center py-2 border-b-2 border-accent text-accent mono text-[11px] tracking-[0.22em] uppercase">
            新規登録
          </div>
        </div>

        <h1 className="serif text-3xl mb-3">アカウントを作成</h1>
        <p className="text-[12px] text-muted leading-[1.85] mb-8">
          登録時に <strong className="text-accent">1 トークン</strong> 付与 (ハウススタジオ 1 件分の 3DGS が試せる)。
          3DGS ウォークスルーは <Link href="/pricing" className="text-accent">サブスク</Link> で月次トークンが付与されます。
        </p>

        <button
          type="button"
          disabled
          className="w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-accent text-accent hover:bg-accent hover:text-bg transition"
        >
          Google で続行（Clerk 接続待ち）
        </button>
        <button
          type="button"
          disabled
          className="mt-2 w-full px-4 py-3 mono text-[11px] tracking-[0.24em] uppercase border border-line opacity-70"
        >
          Email で続行（Clerk 接続待ち）
        </button>

        <div className="mt-8 text-[12px] text-muted text-center">
          既にアカウントをお持ちですか？{" "}
          <Link href="/sign-in" className="text-accent hover:underline">
            ログイン →
          </Link>
        </div>
      </div>
    </div>
  );
}
