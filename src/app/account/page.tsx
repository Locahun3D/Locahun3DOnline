import Link from "next/link";
import { requireOnboarded } from "@/lib/dal";
import { acceptNdaAction } from "@/lib/auth-actions";
import { ROLE_LABEL, ACCOUNT_STATUS_LABEL, totalTokens } from "@/lib/account-schema";

export const metadata = { title: "プロフィール" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; nda?: string }>;
}) {
  const user = await requireOnboarded();
  const { welcome, nda } = await searchParams;

  return (
    <div className="theme-online frame pt-12 pb-32">
      <div className="chapter-rule">
        <span className="opacity-60">ACCOUNT</span>
        <span>Profile</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      {welcome && (
        <div className="mb-6 border border-accent/40 bg-accent/10 px-4 py-3 text-[13px]">
          {welcome === "pending" ? (
            <>
              ようこそ。<strong className="text-accent">{ROLE_LABEL[user.role]}</strong>
              アカウントは現在<strong>承認待ち</strong>です。運営の承認後にプロ機能が有効化されます。
            </>
          ) : (
            <>登録が完了しました。<strong className="text-accent">1 トークン</strong>を付与しました。</>
          )}
        </div>
      )}
      {nda && (
        <div className="mb-6 border border-green-400/40 bg-green-400/10 px-4 py-3 text-[13px]">
          NDA への同意を記録しました。機密ロケ地の閲覧が可能になりました。
        </div>
      )}

      <header className="mb-10">
        <h1 className="serif text-[clamp(1.8rem,3.4vw,2.8rem)] font-bold">
          {user.name}
        </h1>
        <p className="text-[13px] text-muted mt-2 flex items-center gap-2">
          <span className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-1.5 py-0.5">
            {ROLE_LABEL[user.role]}
          </span>
          {user.status !== "active" && (
            <span className="mono text-[10px] tracking-[0.2em] uppercase border border-amber-400/40 text-amber-400 px-1.5 py-0.5">
              {ACCOUNT_STATUS_LABEL[user.status]}
            </span>
          )}
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
              <dd>{user.name}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                Email
              </dt>
              <dd className="mono text-[11px]">{user.email}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                所属
              </dt>
              <dd>{user.company || "—"}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                登録日
              </dt>
              <dd className="mono text-[11px]">
                {(user.createdAt ?? "").slice(0, 10) || "—"}
              </dd>
            </dl>
          </div>

          <div className="pt-5 border-t border-line">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
              利用中プラン
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="serif text-2xl uppercase">{user.plan}</div>
                <div className="mono text-[10px] text-muted mt-1">
                  {user.plan === "free" ? "無料プラン" : "サブスクリプション"}
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

          {user.role === "production" && (
            <div className="pt-5 border-t border-line">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                NDA（秘密保持契約）
              </div>
              {user.ndaAcceptedAt ? (
                <p className="text-[13px] text-green-400">
                  ✓ 締結済（{user.ndaAcceptedAt.slice(0, 10)}）— 機密ロケ地を閲覧できます。
                </p>
              ) : (
                <form action={acceptNdaAction} className="space-y-3">
                  <p className="text-[12px] text-muted leading-[1.8]">
                    倉庫裏・非公開スタジオ等の機密ロケ地を閲覧するには、NDA への同意が必要です。
                  </p>
                  <button className="mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition">
                    NDA に同意する
                  </button>
                </form>
              )}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="border border-line p-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              トークン残
            </div>
            <div className="serif text-3xl text-accent">{totalTokens(user)}</div>
            <div className="mono text-[10px] text-muted mt-1">
              3DGS ウォークスルーで消費
            </div>
            {user.bonusTokens > 0 && (
              <div className="mono text-[10px] text-accent/80 mt-2 leading-[1.6]">
                うち {user.bonusTokens} は<strong>失効しない</strong>貢献特別枠
                <span className="block opacity-60">月次 {user.tokenBalance} ＋ 貢献 {user.bonusTokens}</span>
              </div>
            )}
          </div>

          <div className="border border-line p-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              ブックマーク
            </div>
            <div className="serif text-3xl">{user.bookmarks.length}</div>
            <Link
              href="/properties"
              className="mt-3 inline-block mono text-[10px] tracking-[0.22em] uppercase text-accent hover:underline"
            >
              物件を探す →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
