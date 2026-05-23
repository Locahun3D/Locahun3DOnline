import Link from "next/link";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="frame min-h-[72vh] flex items-center justify-center py-20">
      <div className="border border-line bg-[#070707] p-10 w-full max-w-md">
        <div className="mono text-[10px] tracking-[0.32em] uppercase opacity-50 mb-2">
          Sign in
        </div>
        <h1 className="serif text-3xl mb-6">おかえりなさい</h1>

        <p className="text-[13px] text-muted leading-[1.85] mb-8">
          本実装は <strong className="text-ink">Clerk</strong> による
          ソーシャルログイン / Magic link を予定しています。現在はプレースホルダーです。
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
            アカウント作成
          </Link>
        </div>
      </div>
    </div>
  );
}
