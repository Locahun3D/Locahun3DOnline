import "server-only";
import { generateReceiptHtml } from "./receipt";
import { repo as propertyRepo } from "./store";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC } from "./schemas";
import type { Purchase } from "./purchases";

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
