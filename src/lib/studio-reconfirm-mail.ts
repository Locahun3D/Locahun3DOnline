/**
 * みなし承認の流れで送るメールの文面（純関数・2026-10-08）。施設掲載規約 第4条3項。
 *
 *  - buildStudioReconfirmMail: 確認メールから14日たっても回答が無いスタジオへの「再確認のお願い」（社外・1回だけ）
 *  - buildDeemedApprovalAdminMail: みなし承認で公開した／保留した、を運営へ知らせる（社内宛）
 *
 * 送信は Worker の定期実行（deemed-approval-job.ts）。ここは文面だけ（実送信なしにテストできる）。
 * Next の外でも読み込まれるので "server-only" を import しないこと。
 */
import { formatExpiryJst } from "./studio-review-mail";
import { DEEMED_PUBLISH_AFTER_DAYS } from "./publish-flow";

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface StudioReconfirmMailInput {
  studioName: string;
  /** 最初の確認メールを送った日時 (ISO)。 */
  firstSentAt: string;
  /** この再確認メールを送る日時 (ISO)。公開予定日の計算に使う。 */
  now: string;
  /** プレビューURL（承認キーなし・絶対URL）。有効なプレビューが無ければ省略。 */
  previewUrl?: string;
  contactAddress?: string;
  siteUrl?: string;
}

export interface MailText {
  subject: string;
  heading: string;
  bodyHtml: string;
}

/** 再確認メールの公開予定日（再確認の送信から7日後）。 */
export function deemedPublishDate(nowIso: string): string {
  const t = Date.parse(nowIso);
  if (Number.isNaN(t)) return "";
  return new Date(t + DEEMED_PUBLISH_AFTER_DAYS * 86_400_000).toISOString();
}

export function buildStudioReconfirmMail(input: StudioReconfirmMailInput): MailText {
  const name = input.studioName.trim() || "貴スタジオ";
  const contact = input.contactAddress || "contact@locahun3d.com";
  const site = (input.siteUrl || "https://locahun3d.com").replace(/\/$/, "");
  const firstSent = formatExpiryJst(input.firstSentAt);
  const publishOn = formatExpiryJst(deemedPublishDate(input.now));
  const p = 'style="font-size:14px;line-height:1.9;margin:0 0 16px;"';

  // 説明文は句点ごとに改行（サイトの日本語タイポグラフィルールと同じ）。
  const bodyHtml = `
    <p ${p}>${esc(name)} ご担当者様</p>
    <p ${p}>ロケハン3D（運営：KWI株式会社）です。<br>
    ${firstSent ? `${esc(firstSent)}に` : "先日、"}「${esc(name)}」の掲載内容のご確認をお願いするメールをお送りしました。<br>
    まだご回答を確認できていないため、改めてご連絡いたしました。<br>
    お忙しいところ恐れ入りますが、内容をご確認いただけますと幸いです。</p>
    ${input.previewUrl ? `
    <p style="margin:20px 0;">
      <a href="${esc(input.previewUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:.1em;">掲載ページのプレビューを開く →</a>
    </p>` : ""}
    <p ${p}>問題がなければ、先日のメールのリンクから開いたプレビューページの「この内容でOK・公開する」ボタンを押すか、このメールへの返信で「OK」とお知らせください。<br>
    修正のご希望がある場合も、このメールへの返信でお知らせください。</p>
    <div style="background:#f7f7f5;border:1px solid #eee;padding:14px 18px;margin:0 0 16px;">
      <p style="font-size:14px;line-height:1.9;margin:0;">
        このメールから<strong>${DEEMED_PUBLISH_AFTER_DAYS}日以内</strong>${publishOn ? `（${esc(publishOn)}まで）` : ""}にご回答がない場合は、ご承認いただいたものとして掲載ページを公開いたします（施設掲載規約 第4条）。<br>
        公開後も、内容の修正や掲載の停止・削除はいつでもお申し付けいただけます。
      </p>
    </div>
    <p style="font-size:12px;line-height:1.8;color:#999;margin:0 0 16px;">お問い合わせ: ${esc(contact)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
    <p style="font-size:12px;line-height:1.8;color:#666;margin:0;">
      ロケハン3D（運営：Kawaii World Industries株式会社（KWI株式会社））<br>
      〒160-0022 東京都新宿区新宿1-24-12 THE GATE 新宿御苑 1F<br>
      ${esc(contact)}<br>
      <a href="${esc(site)}" style="color:#666;">${esc(site)}</a>
    </p>
  `;
  return {
    subject: `【ロケハン3D】掲載内容の再確認のお願い（${name}）`,
    heading: "掲載内容の再確認のお願い",
    bodyHtml,
  };
}

export type DeemedAdminEvent =
  | { kind: "published"; splitNote?: string }
  | { kind: "held"; missing: string[] };

/** みなし承認で公開した／期限が来たが保留した、を運営へ知らせる（社内宛のみ）。 */
export function buildDeemedApprovalAdminMail(input: {
  propertyId: string;
  title: string;
  siteUrl: string;
  event: DeemedAdminEvent;
}): MailText {
  const site = input.siteUrl.replace(/\/$/, "");
  const name = esc(input.title || input.propertyId);
  const edit = esc(`${site}/admin/properties/${input.propertyId}/edit`);
  if (input.event.kind === "published") {
    const pub = esc(`${site}/properties/${input.propertyId}`);
    return {
      subject: `【ロケハン3D】みなし承認で公開しました（${input.title || input.propertyId}）`,
      heading: "みなし承認で公開しました",
      bodyHtml: `<p style="font-size:14px;line-height:1.9;margin:0 0 16px;">「${name}」は、確認メールと再確認メールのどちらにも回答が無かったため、施設掲載規約 第4条3項に基づき、承認されたものとみなして公開しました。<br>
        物件編集の記録に「みなし承認」として残っています。</p>
        <p style="margin:0 0 16px;"><a href="${pub}">公開ページを開く</a> ／ <a href="${edit}">物件編集を開く</a></p>
        ${input.event.splitNote ? `<p style="font-size:12px;line-height:1.8;color:#666;margin:0 0 8px;">${esc(input.event.splitNote)}</p>` : ""}
        <p style="font-size:12px;line-height:1.8;color:#666;margin:0;">取り下げる場合は、物件編集の「公開停止」を押してください。</p>`,
    };
  }
  const missing = input.event.missing.length ? `（不足: ${esc(input.event.missing.join("、"))}）` : "";
  return {
    subject: `【ロケハン3D】みなし承認の期限・公開は保留（${input.title || input.propertyId}）`,
    heading: "みなし承認の期限が来ました（公開は保留）",
    bodyHtml: `<p style="font-size:14px;line-height:1.9;margin:0 0 16px;">「${name}」は再確認から${DEEMED_PUBLISH_AFTER_DAYS}日たっても回答がありませんでしたが、公開に必要な項目が足りないため公開していません${missing}。<br>
      内容を仕上げてから、物件編集で公開してください。</p>
      <p style="margin:0;"><a href="${edit}">物件編集を開く</a></p>`,
  };
}
