import Link from "next/link";

export const metadata = { title: "アカウント作成" };

export default function SignUpPage() {
  return (
    <div className="frame min-h-[72vh] flex items-center justify-center py-20">
      <div className="border border-line bg-[#070707] p-10 w-full max-w-md">
        <div className="mono text-[10px] tracking-[0.32em] uppercase text-accent mb-2">
          Sign up
        </div>
        <h1 className="serif text-3xl mb-6">アカウントを作成</h1>

        <p className="text-[13px] text-muted leading-[1.85] mb-8">
          無料枠でも全物件の写真とサマリーは閲覧できます。
          3DGS ウォークスルーは <Link href="/pricing" className="text-accent">サブスク</Link> 必須です。
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
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
