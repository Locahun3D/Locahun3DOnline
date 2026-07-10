import Link from "next/link";
import { requireOnboarded } from "@/lib/dal";
import { acceptNdaAction } from "@/lib/auth-actions";
import { roleLabel, accountStatusLabel, totalTokens } from "@/lib/account-schema";
import RedeemGift from "@/components/account/redeem-gift";
import AccountDashboard from "@/components/account/account-dashboard";
import { openBillingPortalAction } from "@/lib/subscribe-actions";
import { getLocale } from "@/lib/i18n/server";
import { localizedHref } from "@/lib/i18n/dictionaries";
import { SIGNUP_BONUS_TOKENS } from "@/lib/schemas";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { getPublishedProperties } from "@/lib/properties";
import { repo as propertyRepo } from "@/lib/store";

export const metadata = { title: "プロフィール" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; nda?: string; plan?: string }>;
}) {
  const user = await requireOnboarded();
  const { welcome, nda, plan } = await searchParams;
  const locale = await getLocale();
  const en = locale === "en";
  const lc = en ? "en" : "ja";
  const lh = (href: string) => localizedHref(href, locale);
  const nowIso = new Date().toISOString();
  const allUnlocks = await viewUnlockRepo.list({ userId: user.id });
  const unlockedCount = allUnlocks.filter((u) => u.expiresAt > nowIso).length;

  // ── 閲覧履歴タイル用: 直近の「まだ有効な（無償再視聴期間内の）」アンロック1件 ──
  // viewUnlockRepo.list は unlockedAt 降順で返るので先頭が最新。
  const lastValidUnlock = allUnlocks.find((u) => u.expiresAt > nowIso) ?? null;
  const lastUnlockProperty = lastValidUnlock
    ? await propertyRepo.get(lastValidUnlock.propertyId)
    : null;
  const lastUnlockSceneLabel = (() => {
    if (!lastValidUnlock || !lastUnlockProperty) return "";
    const item = lastValidUnlock.splatItemId
      ? lastUnlockProperty.splatItems.find((it) => it.id === lastValidUnlock.splatItemId)
      : lastUnlockProperty.splatItems[lastValidUnlock.splatItemIndex];
    return item?.label || `#${lastValidUnlock.splatItemIndex + 1}`;
  })();

  // ── 保存ボード（ブックマークフォルダ）タイルをマイページに表示 ──
  const bookmarkIds = user.bookmarks ?? [];
  const folders = user.bookmarkFolders ?? [];
  const assignments = user.bookmarkFolderAssignments ?? {};
  const boardTiles: { name: string; count: number; cover?: string }[] = [];
  if (bookmarkIds.length > 0) {
    const byId = new Map((await getPublishedProperties()).map((p) => [p.id, p]));
    const coverOf = (ids: string[]) => {
      for (const id of ids) {
        const c = byId.get(id)?.cover?.src;
        if (c) return c;
      }
      return undefined;
    };
    boardTiles.push({
      name: en ? "All" : "すべて",
      count: bookmarkIds.length,
      cover: coverOf(bookmarkIds),
    });
    for (const f of folders) {
      const ids = bookmarkIds.filter((id) => assignments[id] === f.id);
      boardTiles.push({ name: f.name, count: ids.length, cover: coverOf(ids) });
    }
    const unsorted = bookmarkIds.filter(
      (id) => !assignments[id] || !folders.some((f) => f.id === assignments[id]),
    );
    if (unsorted.length > 0 || folders.length > 0) {
      boardTiles.push({
        name: en ? "Unsorted" : "未整理",
        count: unsorted.length,
        cover: coverOf(unsorted),
      });
    }
  }

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
            en ? (
              <>
                Welcome. Your <strong className="text-accent">{roleLabel(user.role, "en")}</strong>{" "}
                account is currently <strong>pending approval</strong>. Pro features activate once our team approves it.
              </>
            ) : (
              <>
                ようこそ。<strong className="text-accent">{roleLabel(user.role, "ja")}</strong>
                アカウントは現在<strong>承認待ち</strong>です。運営の承認後にプロ機能が有効化されます。
              </>
            )
          ) : en ? (
            <>Registration complete. We&apos;ve granted you <strong className="text-accent">{SIGNUP_BONUS_TOKENS} tokens</strong>.</>
          ) : (
            <>登録が完了しました。<strong className="text-accent">{SIGNUP_BONUS_TOKENS} トークン</strong>を付与しました。</>
          )}
        </div>
      )}
      {nda && (
        <div className="mb-6 border border-green-400/40 bg-green-400/10 px-4 py-3 text-[13px]">
          {en
            ? "Your NDA agreement has been recorded. You can now view confidential locations."
            : "NDA への同意を記録しました。機密ロケ地の閲覧が可能になりました。"}
        </div>
      )}
      {plan && (
        <div className="mb-6 border border-accent/40 bg-accent/10 px-4 py-3 text-[13px]">
          {en ? (
            <>
              Your plan has been changed to <strong className="text-accent uppercase">{plan}</strong>.
              Monthly tokens have been granted.
            </>
          ) : (
            <>
              プランを <strong className="text-accent uppercase">{plan}</strong> に変更しました。
              月次トークンを付与しました。
            </>
          )}
          <span className="block mono text-[10px] text-muted mt-1">
            {en
              ? "※ Payment integration in progress (changes apply instantly for now)"
              : "※ 決済連携は準備中（現在は即時反映）"}
          </span>
        </div>
      )}

      <AccountDashboard
        user={user}
        locale={locale}
        boardTiles={boardTiles}
        totalBoardCount={folders.length}
        lastUnlock={lastValidUnlock}
        lastUnlockProperty={lastUnlockProperty}
        lastUnlockSceneLabel={lastUnlockSceneLabel}
        nowIso={nowIso}
      />

      {user.status !== "active" && (
        <div className="mb-6 -mt-4">
          <span className="mono text-[10px] tracking-[0.2em] uppercase border border-amber-400/40 text-amber-400 px-1.5 py-0.5">
            {accountStatusLabel(user.status, lc)}
          </span>
        </div>
      )}

      <div className="chapter-rule">
        <span className="opacity-60">DETAILS</span>
        <span>{en ? "Full account details" : "アカウント詳細"}</span>
        <span className="flex-1 h-px bg-current opacity-25" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <section className="md:col-span-2 border border-line p-6 space-y-5">
          <div>
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Basic info" : "基本情報"}
            </div>
            <dl className="grid grid-cols-[80px_1fr] sm:grid-cols-[110px_1fr] gap-y-3 text-[13px]">
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                {en ? "Name" : "氏名"}
              </dt>
              <dd>{user.name}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                Email
              </dt>
              <dd className="mono text-[11px]">{user.email}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                {en ? "Company" : "所属"}
              </dt>
              <dd>{user.company || "—"}</dd>
              <dt className="mono text-[10px] tracking-[0.22em] uppercase opacity-50 pt-0.5">
                {en ? "Joined" : "登録日"}
              </dt>
              <dd className="mono text-[11px]">
                {(user.createdAt ?? "").slice(0, 10) || "—"}
              </dd>
            </dl>
          </div>

          <div className="pt-5 border-t border-line">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
              {en ? "Current plan" : "利用中プラン"}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
              <div>
                <div className="serif text-2xl uppercase">{user.plan}</div>
                <div className="mono text-[10px] text-muted mt-1">
                  {user.plan === "free"
                    ? en ? "Free plan" : "無料プラン"
                    : en ? "Subscription" : "サブスクリプション"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {user.stripeCustomerId && (
                  <form action={openBillingPortalAction}>
                    <button className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition">
                      {en ? "Billing / cancel" : "支払い・解約"}
                    </button>
                  </form>
                )}
                <Link
                  href={lh("/pricing")}
                  className="mono text-[10px] tracking-[0.22em] uppercase border border-line px-3 py-1.5 hover:border-accent hover:text-accent transition"
                >
                  {en ? "Change plan" : "プラン変更"}
                </Link>
              </div>
            </div>
          </div>

          {user.role === "production" && (
            <div className="pt-5 border-t border-line">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                {en ? "NDA (confidentiality)" : "NDA（秘密保持契約）"}
              </div>
              {user.ndaAcceptedAt ? (
                <p className="text-[13px] text-green-400">
                  {en
                    ? `✓ Signed (${user.ndaAcceptedAt.slice(0, 10)}) — you can view confidential locations.`
                    : `✓ 締結済（${user.ndaAcceptedAt.slice(0, 10)}）— 機密ロケ地を閲覧できます。`}
                </p>
              ) : (
                <form action={acceptNdaAction} className="space-y-3">
                  <p className="text-[12px] text-muted leading-[1.8]">
                    {en
                      ? "To view confidential locations such as backyards and private studios, you must agree to the NDA."
                      : "倉庫裏・非公開スタジオ等の機密ロケ地を閲覧するには、NDA への同意が必要です。"}
                  </p>
                  <button className="mono text-[10px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition">
                    {en ? "Agree to NDA" : "NDA に同意する"}
                  </button>
                </form>
              )}
            </div>
          )}

          {user.role !== "production" && user.role !== "admin" && (
            <div className="pt-5 border-t border-line">
              <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-3">
                {en ? "Team plan / NDA viewing" : "Teamプラン・NDA閲覧"}
              </div>
              <p className="text-[12px] text-muted leading-[1.8] mb-3">
                {en
                  ? "Team's NDA / restricted-scene viewing is limited to Production accounts. Apply to switch your account type — reviewed by our team."
                  : "TeamプランのNDA / 制限あり閲覧は「制作会社」アカウント限定です。申請するとアカウント種別を切り替えられます（運営が確認）。"}
              </p>
              {user.status === "pending" ? (
                <span className="mono text-[10px] tracking-[0.2em] uppercase border border-amber-400/40 text-amber-400 px-4 py-2 inline-block">
                  {en ? "Application under review" : "審査中です"}
                </span>
              ) : (
                <Link
                  href={lh("/account/upgrade")}
                  className="mono text-[10px] tracking-[0.2em] uppercase border border-line px-4 py-2 hover:border-accent hover:text-accent transition inline-block"
                >
                  {en ? "Apply for a Production account" : "制作会社アカウントを申請"}
                </Link>
              )}
            </div>
          )}

          {/* ── 保存ボード（ブックマークフォルダ）群 ── */}
          {boardTiles.length > 0 && (
            <div className="pt-5 border-t border-line">
              <div className="flex items-center justify-between mb-3">
                <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60">
                  {en ? "Saved boards" : "保存ボード"}
                </div>
                <Link
                  href={lh("/dashboard/bookmarks")}
                  className="mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
                >
                  {en ? "Manage →" : "整理する →"}
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {boardTiles.map((t, i) => (
                  <Link
                    key={i}
                    href={lh("/dashboard/bookmarks")}
                    className="group border border-line overflow-hidden hover:border-accent transition"
                  >
                    <div className="relative aspect-[16/10] bg-[#141414]">
                      {t.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.cover}
                          alt=""
                          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
                        />
                      ) : (
                        <div className="w-full h-full grid place-items-center mono text-[9px] opacity-40">
                          {en ? "empty" : "空"}
                        </div>
                      )}
                      <span className="absolute bottom-1 right-1 mono text-[9px] leading-[14px] text-white bg-black/55 px-1.5 rounded-full">
                        {t.count}
                      </span>
                    </div>
                    <div className="px-2 py-1.5 text-[11px] font-bold truncate">{t.name}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="border border-line p-5">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Tokens left" : "トークン残"}
            </div>
            <div className="serif text-3xl text-accent">{totalTokens(user)}</div>
            <div className="mono text-[10px] text-muted mt-1">
              {en ? "Used for 3DGS walkthroughs" : "3DGS ウォークスルーで消費"}
            </div>
            {user.bonusTokens > 0 && (
              <div className="mono text-[10px] text-accent/80 mt-2 leading-[1.6]">
                {en ? (
                  <>
                    {user.bonusTokens} of these are <strong>non-expiring</strong> contributor tokens
                    <span className="block opacity-60">Monthly {user.tokenBalance} + contributor {user.bonusTokens}</span>
                  </>
                ) : (
                  <>
                    うち {user.bonusTokens} は<strong>失効しない</strong>貢献特別枠
                    <span className="block opacity-60">月次 {user.tokenBalance} ＋ 貢献 {user.bonusTokens}</span>
                  </>
                )}
              </div>
            )}
            {user.tokenExpiresAt && user.tokenBalance > 0 && (
              <div className="mono text-[10px] text-amber-400/90 mt-2 leading-[1.6]">
                {en ? (
                  <>
                    {user.tokenBalance} monthly tokens expire on{" "}
                    <strong>{user.tokenExpiresAt.slice(0, 10)}</strong>
                  </>
                ) : (
                  <>
                    月次 {user.tokenBalance} トークンは{" "}
                    <strong>{user.tokenExpiresAt.slice(0, 10)}</strong> に失効予定
                  </>
                )}
              </div>
            )}
          </div>

          <RedeemGift />

          <Link
            href={lh("/dashboard/unlocked")}
            className="border border-line p-5 block hover:border-accent transition"
          >
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Unlocked scenes" : "閲覧履歴・解除済みシーン"}
            </div>
            <div className="serif text-3xl">{unlockedCount}</div>
            <div className="mt-3 mono text-[10px] tracking-[0.22em] uppercase text-accent">
              {en ? "View history →" : "履歴を見る →"}
            </div>
          </Link>

          <Link href={lh("/dashboard/purchases")} className="block border border-line p-5 hover:border-accent/40 transition">
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Purchases" : "購入履歴"}
            </div>
            <div className="mono text-[10px] tracking-[0.22em] uppercase text-accent">
              {en ? "History & receipts →" : "購入履歴・領収書 →"}
            </div>
          </Link>

          <Link
            href={lh("/dashboard/bookmarks")}
            className="border border-line p-5 block hover:border-accent transition"
          >
            <div className="mono text-[10px] tracking-[0.28em] uppercase opacity-60 mb-2">
              {en ? "Saved locations" : "保存した物件"}
            </div>
            <div className="serif text-3xl">{user.bookmarks.length}</div>
            <div className="mt-3 mono text-[10px] tracking-[0.22em] uppercase text-accent">
              {en ? "View saved list →" : "保存一覧を見る →"}
            </div>
          </Link>
        </aside>
      </div>
    </div>
  );
}
