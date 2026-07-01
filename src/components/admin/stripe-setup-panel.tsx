import { stripeConfigStatus } from "@/lib/stripe";
import { emailEnabled } from "@/lib/email";
import StripeWebhookSetupButton from "./stripe-webhook-setup-button";

function Row({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className={ok ? "text-green-400" : "text-amber-400"}>{ok ? "✓" : "○"}</span>
      <div>
        <span className={ok ? "text-ink" : "text-muted"}>{label}</span>
        {detail && <span className="mono text-[10px] text-muted ml-2">{detail}</span>}
      </div>
    </div>
  );
}

/**
 * Stripe 本番化のための設定ステータス＋手順（管理者向け）。
 * 値は表示せず存在のみを可視化。データ販売は SECRET_KEY と WEBHOOK_SECRET だけで本番化。
 */
export default function StripeSetupPanel() {
  const s = stripeConfigStatus();
  const mail = emailEnabled();
  const dataSaleReady = s.secretKey; // データ販売は戻りルートで確定するため最低限SECRET_KEYでOK

  return (
    <details className="border border-line bg-[#141414] mb-6">
      <summary className="cursor-pointer px-4 py-3 mono text-[11px] tracking-[0.2em] uppercase flex items-center gap-2 select-none">
        <span className={s.enabled ? "text-green-400" : "text-amber-400"}>●</span>
        決済設定（Stripe 本番化）
        <span className="opacity-50 ml-auto">
          {s.enabled ? (s.live ? "本番キー" : "テストキー") : "未接続"}
        </span>
      </summary>

      <div className="px-4 pb-4 space-y-4 border-t border-line pt-4">
        <div className="space-y-1.5">
          <div className="mono text-[10px] tracking-[0.24em] uppercase opacity-40 mb-1">
            データ販売（3DGS）に必要
          </div>
          <Row ok={s.secretKey} label="STRIPE_SECRET_KEY" detail={s.live ? "sk_live" : s.test ? "sk_test" : "未設定"} />
          <Row ok={s.webhookSecret} label="STRIPE_WEBHOOK_SECRET（推奨・保険）" detail="whsec_…" />
          <div className="text-[11px] text-muted mt-1">
            {dataSaleReady
              ? "→ データ販売は本番決済が有効です（成功時に戻りルートで自動確定）。"
              : "→ SECRET_KEY を入れるとデータ販売が実決済に切替わります。"}
          </div>
          {s.secretKey && !s.webhookSecret && (
            <div className="mt-2 pt-2 border-t border-line/60 space-y-1.5">
              <div className="text-[11px] text-muted">
                現在の鍵（{s.live ? "本番" : "テスト"}）の環境にWebhookをワンクリック登録できます。
                署名シークレットは新規作成時のみ表示されます。
              </div>
              <StripeWebhookSetupButton />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="mono text-[10px] tracking-[0.24em] uppercase opacity-40 mb-1">
            サブスク（料金プラン）も本番化する場合
          </div>
          <Row ok={s.appUrl} label="NEXT_PUBLIC_APP_URL" detail="https://locahun3d.com" />
          <Row ok={s.prices.individual} label="STRIPE_PRICE_INDIVIDUAL_(MONTHLY/ANNUAL)" />
          <Row ok={s.prices.studio} label="STRIPE_PRICE_STUDIO_(MONTHLY/ANNUAL)" />
          <Row ok={s.prices.team} label="STRIPE_PRICE_TEAM_(MONTHLY/ANNUAL)" />
        </div>

        <div className="space-y-1.5 border-t border-line pt-3">
          <div className="mono text-[10px] tracking-[0.24em] uppercase opacity-40 mb-1">
            メール通知（購入・返金・領収書を登録メールへ送信）
          </div>
          <Row ok={mail} label="RESEND_API_KEY" detail={mail ? "送信ON" : "未設定=送信スキップ"} />
          <Row ok={!!process.env.EMAIL_FROM} label="EMAIL_FROM（送信元・任意）" detail="noreply@locahun3d.com" />
          <div className="text-[11px] text-muted mt-1">
            {mail
              ? "→ 購入・返金時に登録メールへ自動送信されます。"
              : "→ Resendの送信ドメイン認証＋APIキー投入で、購入/返金/領収書メールが届きます。"}
            <pre className="mt-1 bg-[#0a0a0a] border border-line p-2 mono text-[10px] overflow-x-auto whitespace-pre">{`npx wrangler secret put RESEND_API_KEY`}</pre>
          </div>
        </div>

        <div className="border-t border-line pt-3">
          <div className="mono text-[10px] tracking-[0.24em] uppercase opacity-40 mb-2">
            設定手順
          </div>
          <ol className="text-[11px] text-muted leading-[1.9] list-decimal pl-4 space-y-0.5">
            <li>Stripeアカウント作成 → 事業者確認 → <strong className="text-ink">銀行口座を登録</strong>（これが入金先）。</li>
            <li>シークレットキー（sk_live / sk_test）を取得。</li>
            <li>Webhook を <span className="mono">https://locahun3d.com/api/stripe/webhook</span> に登録 → whsec_ を取得。</li>
            <li>Workerシークレットに投入:
              <pre className="mt-1 bg-[#0a0a0a] border border-line p-2 mono text-[10px] overflow-x-auto whitespace-pre">{`npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET`}</pre>
            </li>
            <li><span className="mono">npx @opennextjs/cloudflare build &amp;&amp; npx wrangler deploy</span> で反映。</li>
          </ol>
          <p className="text-[10px] text-amber-400/80 mt-2">
            ※ まず sk_test で1度通して確認 → Liveキーへ差替えが安全です。入金はStripeが登録口座へ自動振込します。
          </p>
        </div>
      </div>
    </details>
  );
}
