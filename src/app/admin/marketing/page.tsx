import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { emailEnabled } from "@/lib/email";
import { giftCodeRepo } from "@/lib/gift-codes";
import MarketingComposer from "@/components/admin/marketing-composer";
import GiftCodeAdmin from "@/components/admin/gift-code-admin";

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
    <div className="p-8 max-w-5xl space-y-8">
      <header>
        <h1 className="serif text-3xl font-bold">マーケティング</h1>
        <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
          配信に同意している会員へ一斉メールを送信します。特定電子メール法により、
          広告メールは<strong className="text-ink">オプトイン同意した相手のみ</strong>に、
          配信停止の手段を明記して送る必要があります（本ツールは自動で配信停止リンクを
          全メールに挿入します）。
        </p>
      </header>

      {!emailEnabled() && (
        <div className="border border-red-400/40 bg-red-400/10 px-4 py-3 text-[12px] text-red-300">
          RESEND_API_KEY が未設定のため、実際の送信はできません（テスト送信・一斉送信とも無効）。
        </div>
      )}

      <div className="border border-line bg-[#1c1c1c] px-5 py-4">
        <div className="mono text-[10px] tracking-[0.2em] uppercase opacity-50 mb-1">配信対象</div>
        <div className="serif text-2xl text-accent">{consentedCount} 名</div>
        <p className="text-[11px] text-muted mt-1">配信同意 かつ 有効アカウントの会員数。</p>
      </div>

      <MarketingComposer disabled={!emailEnabled()} />

      <section id="gift-codes" className="border-t border-line pt-10 scroll-mt-24">
        <header className="mb-8">
          <h2 className="serif text-2xl font-bold">ギフトコード</h2>
          <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
            トークン数を設定したコードを発行し、ユーザーに渡せます。受け取った人は
            マイページの「ギフトコードを引き換え」から入力してトークンを受け取ります。
          </p>
        </header>

        <GiftCodeAdmin codes={codes} />
      </section>
    </div>
  );
}
