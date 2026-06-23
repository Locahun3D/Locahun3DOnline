import "server-only";
import { generateReceiptHtml } from "./receipt";
import { repo as propertyRepo } from "./store";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC, PLAN_TOKEN_BUDGET } from "./schemas";
import type { AccountPlan } from "./account-schema";
import type { Purchase } from "./purchases";

const PLAN_LABEL: Record<AccountPlan, string> = {
  free: "Free",
  individual: "Individual",
  studio: "Studio",
  team: "Team",
};

/**
 * メール送信（Resend）。RESEND_API_KEY 未設定なら送信スキップ（Stripeと同じ
 * 「キー無し=何もしない / キー投入で本番送信」パターン）。送信失敗は購入処理を
 * 止めないよう常に握りつぶす。
 */

const RESEND_URL = "https://api.resend.com/emails";

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || "ロケハン3D <noreply@locahun3d.com>";
}

function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://locahun3d.com";
  return `${base}${path}`;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return false;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function shell(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f2;margin:0;padding:24px;color:#111;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;">
    <div style="background:#111;color:#fff;padding:20px 28px;font-weight:700;letter-spacing:.06em;">
      ロケハン3D <span style="opacity:.5;font-size:11px;font-weight:400;">locahun3d.com</span>
    </div>
    <div style="padding:28px;">
      <h1 style="font-size:18px;margin:0 0 16px;">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #eee;font-size:11px;color:#999;">
      発行者: ロケハン3D（中村 航） / お問い合わせ: info@locahun3d.com
    </div>
  </div>
</body></html>`;
}

/** 購入完了メール（領収書を内包）を購入者の登録メールへ送信。 */
export async function notifyPurchase(p: Purchase): Promise<void> {
  if (!emailEnabled() || !p.userEmail) return;
  try {
    const property = await propertyRepo.get(p.propertyId);
    const license =
      property?.splatItems[p.splatItemIndex]?.license ?? "standard";

    const receiptHtml = generateReceiptHtml(
      {
        ...p,
        licenseLabel: DATA_LICENSE_LABEL[license],
        licenseDesc: DATA_LICENSE_DESC[license],
      },
      { forEmail: true },
    );

    const body = `
      <p style="font-size:14px;line-height:1.8;">3DGSデータをご購入いただきありがとうございます。下記の通りお手続きが完了しました。</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;">商品</td><td style="padding:6px 0;text-align:right;">${p.propertyTitle}${p.itemLabel ? ` (${p.itemLabel})` : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">金額（税込）</td><td style="padding:6px 0;text-align:right;font-weight:700;">${yen(p.priceYen)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">ライセンス</td><td style="padding:6px 0;text-align:right;">${DATA_LICENSE_LABEL[license]}</td></tr>
      </table>
      <p style="margin:20px 0;">
        <a href="${appUrl("/dashboard/purchases")}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:.1em;">ダウンロード・領収書はこちら →</a>
      </p>
      <p style="font-size:12px;color:#999;">※ ダウンロードと領収書（PDF保存可）は購入履歴ページからいつでもご利用いただけます。下に領収書を添付しています。</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <div style="font-size:10px;color:#bbb;text-transform:uppercase;letter-spacing:.2em;margin-bottom:8px;">領収書</div>
      ${receiptHtml}
    `;

    await sendEmail({
      to: p.userEmail,
      subject: `【ロケハン3D】ご購入ありがとうございます（${p.propertyTitle}）`,
      html: shell("ご購入ありがとうございます", body),
    });
  } catch {
    /* email失敗は無視 */
  }
}

/** 返金完了メールを購入者の登録メールへ送信。 */
export async function notifyRefund(p: Purchase): Promise<void> {
  if (!emailEnabled() || !p.userEmail) return;
  try {
    const body = `
      <p style="font-size:14px;line-height:1.8;">下記ご購入分の返金手続きが完了しました。</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;">商品</td><td style="padding:6px 0;text-align:right;">${p.propertyTitle}${p.itemLabel ? ` (${p.itemLabel})` : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">返金額</td><td style="padding:6px 0;text-align:right;font-weight:700;">${yen(p.priceYen)}</td></tr>
        ${p.refundReason ? `<tr><td style="padding:6px 0;color:#666;">理由</td><td style="padding:6px 0;text-align:right;">${p.refundReason}</td></tr>` : ""}
      </table>
      <p style="font-size:12px;color:#999;">※ 実決済の場合、口座/カードへの返金反映には数営業日かかることがあります。ご不明点は info@locahun3d.com までご連絡ください。</p>
    `;
    await sendEmail({
      to: p.userEmail,
      subject: `【ロケハン3D】返金完了のお知らせ（${p.propertyTitle}）`,
      html: shell("返金完了のお知らせ", body),
    });
  } catch {
    /* email失敗は無視 */
  }
}

/** サブスク開始（プラン申込）メール＝領収書相当を登録メールへ送信。 */
export async function notifySubscription(opts: {
  to: string;
  plan: AccountPlan;
  amountYen?: number;
  interval?: "monthly" | "annual";
  viaStripe: boolean;
}): Promise<boolean> {
  if (!emailEnabled() || !opts.to || opts.plan === "free") return false;
  try {
    const monthly = PLAN_TOKEN_BUDGET[opts.plan];
    const intervalLabel = opts.interval === "annual" ? "年額" : "月額";
    const amountRow =
      typeof opts.amountYen === "number" && opts.amountYen > 0
        ? `<tr><td style="padding:6px 0;color:#666;">お支払い（${intervalLabel}・税込）</td><td style="padding:6px 0;text-align:right;font-weight:700;">${yen(opts.amountYen)}</td></tr>`
        : "";
    const note = opts.viaStripe
      ? `<p style="font-size:12px;color:#999;">※ 正式な請求書（領収書）はStripeより自動発行・送付されます。マイページの「お支払い情報」からもご確認いただけます。</p>`
      : `<p style="font-size:12px;color:#999;">※ プランは即時有効化されました。お支払い情報の更新はマイページから行えます。</p>`;

    const body = `
      <p style="font-size:14px;line-height:1.8;">${PLAN_LABEL[opts.plan]} プランのお申し込みありがとうございます。下記の通り有効化しました。</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;">プラン</td><td style="padding:6px 0;text-align:right;font-weight:700;">${PLAN_LABEL[opts.plan]}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">月次トークン</td><td style="padding:6px 0;text-align:right;">${monthly} トークン / 月</td></tr>
        ${amountRow}
      </table>
      <p style="margin:20px 0;">
        <a href="${appUrl("/account")}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:.1em;">マイページを開く →</a>
      </p>
      ${note}
    `;
    return await sendEmail({
      to: opts.to,
      subject: `【ロケハン3D】${PLAN_LABEL[opts.plan]} プラン開始のお知らせ`,
      html: shell("プラン開始のお知らせ", body),
    });
  } catch {
    return false;
  }
}
