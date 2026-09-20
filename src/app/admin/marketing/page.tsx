import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { emailEnabled } from "@/lib/email";
import { giftCodeRepo } from "@/lib/gift-codes";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
import MarketingComposer from "@/components/admin/marketing-composer";
import GiftCodeAdmin from "@/components/admin/gift-code-admin";
import StudioRevenueShareNotice from "@/components/admin/studio-revenue-share-notice";

export const metadata = { title: "マーケティング" };

/**
 * 集客まわりの操作を1ページに集約する。
 * ⚠ 旧 /admin/gift-codes は廃止してここへ統合した（2026-07-29）。
 *   同ページにあった「全物件共通の限定無料期間」UIは廃止。無料化は
 *   3DGSデータごとに物件エディターで設定する運用へ一本化したため
 *   （サイト全体を一括で無料にする運用は行わない）。
 */
export default async function AdminMarketingPage() {
  await requireAdmin();
  const [users, codes] = await Promise.all([userRepo.list(), giftCodeRepo.list()]);
  const consentedCount = users.filter((u) => u.marketingConsent && u.status === "active").length;

  return (
    <AdminPageShell className="max-w-[960px] space-y-5">
      {/* 2026-09-20: 小型ヘッダーへ。法令の説明は「使い方」に畳み、配信対象の人数は見出し横の1行にした
          （以前は専用の大きな箱だった）。 */}
      <AdminPageHeader
        title="マーケティング"
        count={`配信対象 ${consentedCount} 名`}
        description="配信に同意している有効な会員へ一斉メールを送ります。"
        help="特定電子メール法により、広告メールはオプトイン同意した相手のみに、配信停止の手段を明記して送る必要があります。配信停止リンクと送信者情報は、全メールの末尾に自動で入ります。"
      />

      {!emailEnabled() && (
        <div className="border border-red-400/40 bg-red-400/10 px-4 py-2 text-[12px] text-red-700">
          メール送信が未設定のため、テスト送信・一斉送信はできません。
        </div>
      )}

      <MarketingComposer disabled={!emailEnabled()} />

      <StudioRevenueShareNotice />

      <section id="gift-codes" className="border-t border-line pt-5 scroll-mt-24">
        <header className="mb-4">
          <h2 className="text-[16px] font-bold">ギフトコード</h2>
          <p className="mt-1 text-[13px] text-muted">
            発行したコードは、受け取った人がマイページの「ギフトコードを引き換え」で使えます。
          </p>
        </header>

        <GiftCodeAdmin codes={codes} />
      </section>
    </AdminPageShell>
  );
}
