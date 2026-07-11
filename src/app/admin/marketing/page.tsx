import { requireAdmin } from "@/lib/dal";
import { userRepo } from "@/lib/users";
import { emailEnabled } from "@/lib/email";
import MarketingComposer from "@/components/admin/marketing-composer";

export const metadata = { title: "マーケティング" };

export default async function AdminMarketingPage() {
  await requireAdmin();
  const users = await userRepo.list();
  const consentedCount = users.filter((u) => u.marketingConsent && u.status === "active").length;

  return (
    <div className="p-8 max-w-3xl space-y-8">
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
    </div>
  );
}
