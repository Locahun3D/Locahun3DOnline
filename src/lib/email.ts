import "server-only";
import { generateReceiptHtml } from "./receipt";
import { DATA_LICENSE_LABEL, DATA_LICENSE_DESC, PLAN_TOKEN_BUDGET, type DataLicense } from "./schemas";
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

/**
 * 運営の受信箱（問い合わせの控え先・/contact の転送先）。
 *
 * 公開表示（特商法・プライバシー・フッター・広告メール）が contact@ なので、
 * 運営コピーの宛先もそこへ統一する。以前は info@ で、顧客に案内している窓口と
 * 実際の受信先が食い違っていた（info@ が受信できていなければ控えが消える）。
 * 変更する場合は EMAIL_OPERATOR で上書きできる。
 */
function operatorAddress(): string {
  return process.env.EMAIL_OPERATOR || "contact@locahun3d.com";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** 返信先（問い合わせ転送で、送信者＝問い合わせ者に返信できるように）。 */
  replyTo?: string;
  /** 控え用の BCC（先方には見えない運営コピー）。 */
  bcc?: string;
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
        ...(opts.bcc ? { bcc: [opts.bcc] } : {}),
        ...(opts.replyTo ? { reply_to: [opts.replyTo] } : {}),
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
      発行者: ロケハン3D（KWI株式会社） / お問い合わせ: contact@locahun3d.com
    </div>
  </div>
</body></html>`;
}

/**
 * 広告メール用のシェル。通常の shell() との違い:
 *  - 配信停止リンクを本文末尾に明記（特定電子メール法は必須要件）。
 *  - 送信者の氏名・所在地・問い合わせ先を tokushoho ページと同じ内容でフル表示
 *    （取引メールの簡易フッターより厳格な表示義務があるため）。
 */
export function marketingShell(title: string, bodyHtml: string, unsubscribeUrl: string): string {
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
    <div style="padding:16px 28px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.8;">
      配信停止をご希望の場合は<a href="${unsubscribeUrl}" style="color:#5ec8e8;">こちら</a>から手続きできます。<br />
      ロケハン3D（運営：KWI株式会社）<br />
      〒160-0022 東京都新宿区新宿1-24-12 THE GATE 新宿御苑 1F<br />
      お問い合わせ: contact@locahun3d.com
    </div>
  </div>
</body></html>`;
}

/** マイページ/オンボーディングで発行する配信停止トークンからURLを組み立てる。 */
export function unsubscribeUrl(userId: string, token: string): string {
  return appUrl(`/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`);
}

/** 購入完了メール（領収書を内包）を購入者の登録メールへ送信。 */
export async function notifyPurchase(p: Purchase): Promise<void> {
  if (!emailEnabled() || !p.userEmail) return;
  try {
    // 購入時点のライセンス区分スナップショットを使う（物件側を後から変更しても
    // 過去の購入の利用範囲は変わらない — receipt route と同じ理由）。
    const license = (p.license as DataLicense) || "standard";

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
      ${p.editorialRightsCredit ? `
      <div style="background:#fff8ec;border:1px solid #f0d9a8;padding:12px 16px;margin:0 0 20px;font-size:12.5px;line-height:1.8;">
        <strong>権利表記（必須）:</strong> 本データを使用した制作物を公開する際は、下記の権利表記を必ず掲載してください。<br>
        ${esc(p.editorialRightsCredit)}
      </div>` : ""}
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
      <p style="font-size:12px;color:#999;">※ 実決済の場合、口座/カードへの返金反映には数営業日かかることがあります。ご不明点は contact@locahun3d.com までご連絡ください。</p>
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

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * スタジオへの問い合わせを「先方メール」へ直接転送する。
 *  - 宛先 = 先方メール（未設定なら運営）。返信先 = 問い合わせ者（先方がそのまま返信可）。
 *  - BCC で運営にも控えを送る（lead を取りこぼさない）。
 *  - RESEND_API_KEY 未設定なら送信されず false（記録は inquiryRepo 側で残る）。
 */
export async function notifyInquiry(opts: {
  propertyTitle: string;
  studioEmail: string;
  name: string;
  company?: string;
  fromEmail: string;
  phone?: string;
  purpose?: string;
  preferredDate?: string;
  preferredTime?: string;
  message: string;
}): Promise<boolean> {
  if (!emailEnabled()) return false;
  const to = opts.studioEmail || operatorAddress();
  const row = (label: string, value?: string) =>
    value
      ? `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;">${esc(value)}</td></tr>`
      : "";
  const body = `
    <p style="font-size:14px;line-height:1.8;">「${esc(opts.propertyTitle)}」へ新しいお問い合わせが届きました。下記の連絡先へ直接ご返信ください（このメールにそのまま返信すると問い合わせ者へ届きます）。</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      ${row("お名前", opts.name)}
      ${row("会社名", opts.company)}
      ${row("メール", opts.fromEmail)}
      ${row("電話", opts.phone)}
      ${row("利用目的", opts.purpose)}
      ${row("利用希望日", opts.preferredDate)}
      ${row("希望時間帯", opts.preferredTime)}
    </table>
    <div style="background:#f7f7f5;border:1px solid #eee;border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.8;white-space:pre-wrap;">${esc(opts.message)}</div>
  `;
  return sendEmail({
    to,
    bcc: to === operatorAddress() ? undefined : operatorAddress(),
    replyTo: opts.fromEmail,
    subject: `【お問い合わせ】${opts.propertyTitle} — ${opts.name} 様`,
    html: shell("スタジオへのお問い合わせ", body),
  });
}

/** 一般お問い合わせ（/contact）を運営へ通知。物件に紐付かないため常に operatorAddress 宛。 */
export async function notifyGeneralContact(opts: {
  typeLabel: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  url?: string;
  environment?: string;
  area?: string;
  propertyName?: string;
  address?: string;
  message: string;
  /** バグ報告の添付画像（/api/r2/... 等の相対URL）。 */
  attachments?: string[];
}): Promise<boolean> {
  if (!emailEnabled()) return false;
  const row = (label: string, value?: string) =>
    value
      ? `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 0;">${esc(value)}</td></tr>`
      : "";
  const attachmentsHtml = opts.attachments?.length
    ? `<div style="margin-top:14px;">
        <div style="font-size:12px;color:#999;margin-bottom:6px;">添付画像（${opts.attachments.length}枚）</div>
        ${opts.attachments
          .map((u) => {
            const abs = /^https?:\/\//.test(u) ? u : appUrl(u);
            return `<div style="margin-bottom:10px;"><a href="${esc(abs)}" target="_blank"><img src="${esc(abs)}" alt="添付画像" style="max-width:100%;max-height:280px;border:1px solid #eee;border-radius:6px;" /></a><br/><a href="${esc(abs)}" style="font-size:11px;color:#888;word-break:break-all;">${esc(abs)}</a></div>`;
          })
          .join("")}
      </div>`
    : "";
  const body = `
    <p style="font-size:14px;line-height:1.8;">サイトの一般お問い合わせフォームから新着です。</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      ${row("種別", opts.typeLabel)}
      ${row("お名前", opts.name)}
      ${row("会社名・オーナー名", opts.company)}
      ${row("メール", opts.email)}
      ${row("電話", opts.phone)}
      ${row("発生ページURL", opts.url)}
      ${row("ご利用環境", opts.environment)}
      ${row("希望エリア", opts.area)}
      ${row("物件名", opts.propertyName)}
      ${row("所在地", opts.address)}
    </table>
    <div style="background:#f7f7f5;border:1px solid #eee;border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.8;white-space:pre-wrap;">${esc(opts.message)}</div>
    ${attachmentsHtml}
  `;
  return sendEmail({
    to: operatorAddress(),
    replyTo: opts.email,
    subject: `【${opts.typeLabel}】サイトお問い合わせ — ${opts.name || "匿名"} 様`,
    html: shell("一般お問い合わせ", body),
  });
}

/** 運営から問い合わせ者への返信メール（アプリ内の返信フォームから送信）。 */
export async function notifyInquiryReply(opts: {
  to: string;
  propertyTitle: string;
  originalMessage: string;
  reply: string;
}): Promise<boolean> {
  if (!emailEnabled() || !opts.to) return false;
  const body = `
    <p style="font-size:14px;line-height:1.8;white-space:pre-wrap;">${esc(opts.reply)}</p>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">
      <div style="font-size:11px;color:#999;margin-bottom:6px;">元のお問い合わせ内容</div>
      <div style="background:#f7f7f5;border:1px solid #eee;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.8;white-space:pre-wrap;color:#666;">${esc(opts.originalMessage)}</div>
    </div>
  `;
  return sendEmail({
    to: opts.to,
    subject: `Re: ${opts.propertyTitle} のお問い合わせ`,
    html: shell(`「${opts.propertyTitle}」についてのご返信`, body),
  });
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
