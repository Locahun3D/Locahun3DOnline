/**
 * スタジオ宛「掲載内容ご確認のお願い」メールの本文ビルダー（純関数・2026-09-20）。
 *
 * 送信は lib/email.ts の sendStudioReviewMail が行う。ここは文面だけを組み立てる
 * （送信と分けておくことで、実送信なしに文面をテストできる）。
 * レイアウトは他のメールと同じ shell()（email.ts）で包むので、ここが返すのは中身の HTML。
 */

export interface StudioReviewMailInput {
  /** スタジオ名（物件名）。 */
  studioName: string;
  /** ログイン不要のプレビューURL（絶対URL）。 */
  previewUrl: string;
  /** プレビューの有効期限 (ISO)。 */
  previewExpiresAt: string;
  /** 再送のとき true（件名に【再送】を付ける）。 */
  resend?: boolean;
  /** 返信先として案内する窓口。 */
  contactAddress?: string;
}

export interface StudioReviewMail {
  subject: string;
  heading: string;
  bodyHtml: string;
}

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** 期限は日本時間の日付で案内する（ISO の slice は UTC になり1日ズレ得る）。 */
export function formatExpiryJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日`;
}

export const STUDIO_REVIEW_CHECKPOINTS = [
  "掲載内容（物件名・紹介文・住所・利用条件）",
  "料金",
  "写真",
  "設備",
] as const;

export function buildStudioReviewMail(input: StudioReviewMailInput): StudioReviewMail {
  const name = input.studioName.trim() || "貴スタジオ";
  const contact = input.contactAddress || "contact@locahun3d.com";
  const expiry = formatExpiryJst(input.previewExpiresAt);
  const p = 'style="font-size:14px;line-height:1.9;margin:0 0 16px;"';
  const checkpoints = STUDIO_REVIEW_CHECKPOINTS.map(
    (c) => `<li style="margin:0 0 4px;">${esc(c)}</li>`,
  ).join("");

  // 説明文は句点ごとに改行（サイトの日本語タイポグラフィルールと同じ）。
  const bodyHtml = `
    <p ${p}>${esc(name)} ご担当者様</p>
    <p ${p}>ロケハン3D（運営：KWI株式会社）です。<br>
    「${esc(name)}」の掲載ページの準備ができました。<br>
    公開の前に、内容に誤りがないかご確認をお願いいたします。</p>
    <p style="margin:20px 0;">
      <a href="${esc(input.previewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:.1em;">掲載ページのプレビューを開く →</a>
    </p>
    <p style="font-size:12px;line-height:1.8;color:#666;margin:0 0 16px;word-break:break-all;">
      ${esc(input.previewUrl)}<br>
      ログインは不要です。${expiry ? `<br>このリンクの有効期限は ${esc(expiry)} までです。` : ""}<br>
      まだ一般には公開されていません。
    </p>
    <div style="background:#f7f7f5;border:1px solid #eee;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:12px;color:#666;margin-bottom:6px;">ご確認いただきたい点</div>
      <ul style="font-size:14px;line-height:1.8;margin:0;padding-left:20px;">${checkpoints}</ul>
    </div>
    <p ${p}>問題がなければ「この内容でOK」と、このメールにそのままご返信ください。<br>
    修正のご希望がある場合も、このメールへの返信でお知らせください。<br>
    ご返信を確認したうえで公開いたします。</p>
    <p style="font-size:12px;line-height:1.8;color:#999;margin:0 0 16px;">お問い合わせ: ${esc(contact)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:12px;line-height:1.7;color:#666;margin:0;">
      English: Your listing page on Locahun3D is ready for review. Please check the preview link above (no login required${expiry ? `, valid until ${esc(expiry)}` : ""}) and reply to this email with your approval or any corrections.
    </p>
  `;

  return {
    subject: `${input.resend ? "【再送】" : ""}【ロケハン3D】掲載内容ご確認のお願い（${name}）`,
    heading: "掲載内容ご確認のお願い",
    bodyHtml,
  };
}
