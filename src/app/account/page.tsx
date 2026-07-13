import { auth } from "@clerk/nextjs/server";
import { requireOnboarded } from "@/lib/dal";
import { roleLabel, accountStatusLabel } from "@/lib/account-schema";
import AccountDashboard from "@/components/account/account-dashboard";
import LoginDevices from "@/components/account/login-devices";
import { listActiveSessions, deviceLimitForPlan } from "@/lib/device-limit";
import { getLocale } from "@/lib/i18n/server";
import { SIGNUP_BONUS_TOKENS } from "@/lib/schemas";
import { viewUnlockRepo } from "@/lib/view-unlocks";
import { getPublishedProperties } from "@/lib/properties";
import { repo as propertyRepo } from "@/lib/store";
import { getSubscriptionBilling } from "@/lib/stripe";
import { listNotifications } from "@/lib/notifications";

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
  const nowIso = new Date().toISOString();
  // PLAN カード用: Stripe 上の実際の請求間隔（月/年）と次回更新日。
  // 未契約・Stripe未設定・APIエラーはすべて null（表示は tokenRefillAt で代替）。
  const billing =
    user.plan !== "free"
      ? await getSubscriptionBilling(user.stripeCustomerId)
      : null;
  const allUnlocks = await viewUnlockRepo.list({ userId: user.id });
  const unlockedCount = allUnlocks.filter((u) => u.expiresAt > nowIso).length;
  const notifications = await listNotifications(user.id);

  // ── ログイン端末（Clerkのアクティブセッション）— マイページから自己管理 ──
  // Clerk API 障害でマイページ全体を落とさないよう空配列にフォールバック。
  const { sessionId: currentSessionId } = await auth();
  const loginSessions = await listActiveSessions(user.id).catch(() => []);
  const deviceLimit = deviceLimitForPlan(user.plan);

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
    <div className="theme-online frame pt-6 sm:pt-12 pb-12 sm:pb-32">
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
        unlockedCount={unlockedCount}
        notifications={notifications}
        billing={billing}
        nowIso={nowIso}
      />

      <div className="mt-6">
        <LoginDevices
          sessions={loginSessions}
          currentSessionId={currentSessionId ?? null}
          limit={deviceLimit}
          locale={locale}
        />
      </div>

      {user.status !== "active" && (
        <div className="mb-6 -mt-4">
          <span className="mono text-[10px] tracking-[0.2em] uppercase border border-amber-400/40 text-amber-400 px-1.5 py-0.5">
            {accountStatusLabel(user.status, lc)}
          </span>
        </div>
      )}
    </div>
  );
}
