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
  /**
   * 3Dデータ販売の許諾をこのメールで同時に聞く（2026-09-26 本人指示）。
   * price は提示する販売価格（税込・円、0 なら「改めてご相談」）。
   * 回答リンクは previewUrl（?approve=キー付き）に &sale=… を足して作る。
   */
  dataSale?: { price: number };
  /**
   * 掲載用の写真をこのメールから送ってもらう（2026-09-26 本人指示）。
   * missing は公開に必要な枚数まであと何枚か（0なら「追加も歓迎」と書く）。
   */
  photoUpload?: { missing: number };
  /** 規約ページの絶対URLを作るためのサイトURL。 */
  siteUrl?: string;
}

/**
 * 確認メールに必ず同送する規約（2026-09-26 本人指示「何もなくても規約のメールが欲しい」）。
 * スタジオから「契約書や規約の控えが欲しい」と言われるたびに人が送っていたので、
 * 掲載の確認メールに常に入れる。中身は lib/terms-catalog.ts（管理画面 /admin/terms と同じ表）。
 */
export const STUDIO_TERMS_DOCS = STUDIO_MAIL_TERMS;

export interface StudioReviewMail {
  subject: string;
  heading: string;
  bodyHtml: string;
}

import { embedSnippet } from "./embed-snippet";
import { REVENUE_SHARE_PERCENT } from "./data-sale-consent";
import { STUDIO_MAIL_TERMS } from "./terms-catalog";

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

/** 英文の末尾で使う期限（日本語の「2026年10月26日」を英文に混ぜない）。時刻は日本時間で切る。 */
export function formatExpiryEn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
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

/** 回答リンク。プレビューURL（?approve=キー）に選択を足し、回答欄まで飛ばす。 */
function saleAnswerUrl(previewUrl: string, choice: "yes" | "no"): string {
  return `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}sale=${choice}#data-sale`;
}

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/**
 * 3Dデータ販売の許諾をお願いする節（2026-09-26）。
 * 掲載の承認ボタンとは別の回答リンクにする（掲載はOK・販売はNG を受け取れるようにするため）。
 */
function dataSaleSection(input: StudioReviewMailInput, name: string): string {
  if (!input.dataSale) return "";
  const price = input.dataSale.price;
  const yes = saleAnswerUrl(input.previewUrl, "yes");
  const no = saleAnswerUrl(input.previewUrl, "no");
  return `
    <div style="border:1px solid #e3d5b5;background:#fffaf0;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">3Dデータの販売について（ご許諾のお願い）</div>
      <p style="font-size:13px;line-height:1.9;margin:0 0 10px;color:#444;">
        撮影した「${esc(name)}」の3Dデータ（PLY・OBJ）を、映像制作者向けにダウンロード販売してよいかをお知らせください。<br>
        ${price > 0
          ? `販売価格は <strong>${esc(yen(price))}（税込）</strong> を予定しています。`
          : "販売価格は、ご許諾をいただいたあとに改めてご相談します。"}<br>
        売上のうち <strong>${REVENUE_SHARE_PERCENT}%</strong> を貴スタジオへ分配します（掲載データ販売分配規約 第2条）。<br>
        分配は四半期ごとの精算です。<br>
        他社へのスキャン許諾を妨げるものではありません（同規約 第5条）。<br>
        販売しない場合でも、掲載ページと3Dツアーはそのままご利用いただけます。
      </p>
      <p style="margin:0;">
        <a href="${esc(yes)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;font-size:13px;margin-right:8px;">3Dデータの販売を許諾する →</a>
        <a href="${esc(no)}" style="display:inline-block;border:1px solid #bbb;color:#333;text-decoration:none;padding:10px 18px;font-size:13px;">今回は販売しない →</a>
      </p>
    </div>`;
}

/**
 * 掲載用の写真をお願いする節（2026-09-26 本人指示）。
 * プレビュー画面の投稿欄へ誘導し、1枚ごとに名前・注釈・カバー希望を書いてもらう
 * （本人「どこの写真かわかるようにつけてといって」）。
 */
function photoSection(input: StudioReviewMailInput): string {
  if (!input.photoUpload) return "";
  const url = `${input.previewUrl}${input.previewUrl.includes("?") ? "&" : "?"}photos=1#photos`;
  const missing = input.photoUpload.missing;
  return `
    <div style="border:1px solid #eee;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">掲載用の写真をお送りいただけます</div>
      <p style="font-size:13px;line-height:1.9;margin:0 0 10px;color:#444;">
        ${missing > 0
          ? `公開にはあと <strong>${missing}枚</strong> の写真が必要です。`
          : "追加の写真もお送りいただけます。"}<br>
        プレビューページの「写真」欄から、その場でお送りいただけます（ログイン不要）。<br>
        スマートフォンで撮った写真をそのまま送っていただいても構いません。
      </p>
      <p style="margin:0 0 8px;">
        <a href="${esc(url)}" style="display:inline-block;border:1px solid #111;color:#111;text-decoration:none;padding:10px 18px;font-size:13px;">写真を送る →</a>
      </p>
      <p style="font-size:12px;line-height:1.8;color:#666;margin:0;">
        1枚ごとに<strong>「名前」（例: 2Fスタジオ 窓側）</strong>と<strong>「注釈」（例: 午前中の自然光）</strong>をご記入ください。<br>
        どの部屋のどの角度かが分かり、掲載ページの説明にそのまま使えます。<br>
        ページの頭（カバー）に使ってほしい写真には、チェックを入れてください。
      </p>
    </div>`;
}

/** 規約の控え（2026-09-26 本人指示。何も無くても毎回同送する）。 */
function termsSection(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const items = STUDIO_TERMS_DOCS.map(
    (d) =>
      `<li style="margin:0 0 6px;"><a href="${esc(base + d.path)}" style="color:#111;">${esc(d.title)}</a>` +
      `<span style="color:#888;"> — ${esc(d.note)}</span></li>`,
  ).join("");
  return `
    <div style="border:1px solid #eee;padding:14px 18px;margin:0 0 16px;">
      <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">規約（掲載・販売に関する条件）</div>
      <p style="font-size:13px;line-height:1.9;margin:0 0 8px;color:#444;">
        掲載と3Dデータ販売の条件は、下記の規約のとおりです。<br>
        ご確認のうえ、ご不明な点はこのメールへの返信でお知らせください。
      </p>
      <ul style="font-size:13px;line-height:1.8;margin:0;padding-left:20px;">${items}</ul>
      <p style="font-size:12px;line-height:1.8;color:#666;margin:8px 0 0;">
        PDF や書面の控えが必要な場合は、その旨ご返信ください。
      </p>
    </div>`;
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
    <p style="font-size:12px;line-height:1.8;color:#666;margin:0 0 16px;">
      ${expiry ? `このリンクの有効期限は ${esc(expiry)} までです。<br>` : ""}まだ一般には公開されていません。
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
        訪問者はログイン不要で、そのまま歩いて見られます。
      </p>
      ${embedCodeBlock(input.embedUrl, name)}
      <p style="font-size:12px;line-height:1.8;color:#666;margin:10px 0 0;word-break:break-all;">
        リンクだけを使う場合: ${esc(input.embedUrl)}
      </p>
    </div>` : ""}
    ${photoSection(input)}
    ${dataSaleSection(input, name)}
    ${termsSection(input.siteUrl || "https://locahun3d.com")}
    <p ${p}>問題がなければ、プレビューページの上部にある「この内容でOK・公開する」ボタンを押してください。<br>
    ボタンを押した時点で、掲載ページが公開されます。<br>
    修正のご希望がある場合は、ボタンを押さずに、このメールへの返信でお知らせください。</p>
    <p style="font-size:12px;line-height:1.8;color:#999;margin:0 0 16px;">お問い合わせ: ${esc(contact)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:12px;line-height:1.7;color:#666;margin:0;">
      English: Your listing page on Locahun3D is ready for review. Please check the preview link above (no login required${expiry ? `, valid until ${esc(formatExpiryEn(input.previewExpiresAt))}` : ""}) then press the “Approve and publish” button at the top of the preview page to publish it, or reply to this email with any corrections.${input.dataSale ? " We also ask whether we may sell the 3D data (PLY/OBJ) of your studio; you can answer with the two links above. You receive " + REVENUE_SHARE_PERCENT + "% of such sales. The applicable terms are linked above." : ""}
    </p>
  `;

  return {
    subject: `${input.resend ? "【再送】" : ""}【ロケハン3D】掲載内容ご確認のお願い（${name}）`,
    heading: "掲載内容ご確認のお願い",
    bodyHtml,
  };
}
