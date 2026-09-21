/**
 * スタジオ宛「掲載内容ご確認のお願い」メールの本文ビルダー（純関数・2026-09-20）。
 *
 * 送信は lib/email.ts の sendStudioReviewMail が行う。ここは文面だけを組み立てる
 * （送信と分けておくことで、実送信なしに文面をテストできる）。
 * レイアウトは他のメールと同じ shell()（email.ts）で包むので、ここが返すのは中身の HTML。
 */

export interface StudioReviewMailInput {
  /**
   * 自社サイトへ貼れる3Dツアーの埋め込みURL（絶対URL・**期限なし**）。2026-09-21 本人指示。
   * 渡すと「自社サイトへの掲載」の節が付く。省略すると節ごと出ない（トークンを作れなかった場合）。
   */
  embedUrl?: string;
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

import { embedSnippet } from "./embed-snippet";

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
  "写真（公式サイト等から引用している写真を、このページに掲載してよいか）",
  "設備",
] as const;

/** メール本文に載せる貼り付け用コード。文字参照に直してから <pre> に入れる。 */
function embedCodeBlock(url: string, studioName: string): string {
  const code = embedSnippet(url, { title: `${studioName} 3Dツアー` });
  return `<pre style="margin:0;padding:12px 14px;background:#0f1115;color:#d8d8d8;font-size:11.5px;line-height:1.7;overflow-x:auto;white-space:pre;border-radius:4px;"><code>${esc(code)}</code></pre>`;
}

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
    ${input.embedUrl ? `
    <div style="border:1px solid #eee;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">貴社サイトに3Dツアーを貼れます（無料・期限なし）</div>
      <p style="font-size:13px;line-height:1.9;margin:0 0 10px;color:#444;">
        下のコードを、貴社サイトの載せたい場所にそのまま貼り付けてください。<br>
        幅は貼った場所に合わせて伸び縮みし、スマートフォンでも崩れません。<br>
        訪問者はログイン不要で、そのまま歩いて見られます。
      </p>
      ${embedCodeBlock(input.embedUrl, name)}
      <p style="font-size:12px;line-height:1.8;color:#666;margin:10px 0 0;word-break:break-all;">
        リンクだけを使う場合: ${esc(input.embedUrl)}<br>
        このURLは期限切れになりません（貼り替えは不要です）。停止したいときは当社までご連絡ください。
      </p>
    </div>` : ""}
    <p ${p}>問題がなければ、プレビューページの上部にある「この内容でOK・公開する」ボタンを押してください。<br>
    ボタンを押した時点で、掲載ページが公開されます。<br>
    修正のご希望がある場合は、ボタンを押さずに、このメールへの返信でお知らせください。</p>
    <p style="font-size:12px;line-height:1.8;color:#999;margin:0 0 16px;">お問い合わせ: ${esc(contact)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:12px;line-height:1.7;color:#666;margin:0;">
      English: Your listing page on Locahun3D is ready for review. Please check the preview link above (no login required${expiry ? `, valid until ${esc(expiry)}` : ""}) then press the “Approve and publish” button at the top of the preview page to publish it, or reply to this email with any corrections.
    </p>
  `;

  return {
    subject: `${input.resend ? "【再送】" : ""}【ロケハン3D】掲載内容ご確認のお願い（${name}）`,
    heading: "掲載内容ご確認のお願い",
    bodyHtml,
  };
}
