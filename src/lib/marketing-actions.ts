"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "./dal";
import { userRepo } from "./users";
import { sendEmail, emailEnabled, marketingShell, unsubscribeUrl } from "./email";

/**
 * マイページからの配信同意トグル（オンボーディング後にいつでも変更できる、
 * 特定電子メール法のオプトイン原則に沿ってデフォルトOFF・自己申告のみON）。
 */
export async function updateMarketingConsentAction(consent: boolean): Promise<void> {
  const current = await getCurrentUser();
  if (!current) return;
  const u = await userRepo.get(current.id);
  if (!u) return;
  await userRepo.upsert({
    ...u,
    marketingConsent: consent,
    marketingConsentAt: consent ? new Date().toISOString() : null,
    unsubscribeToken: consent && !u.unsubscribeToken ? crypto.randomUUID() : u.unsubscribeToken,
  });
  revalidatePath("/account");
}

export type CampaignState =
  | { ok: true; sent: number; failed: number; skipped: number }
  | { ok: false; error: string }
  | undefined;

/**
 * 配信同意済みユーザー全員へ広告メールを一斉送信する（管理者専用）。
 *
 * ⚠ スケールしない実装であることを明記: Cloudflare Workers の1リクエストの
 * 実行時間内で逐次 await ループしているため、宛先が数百〜数千件規模になると
 * タイムアウトする。現状の会員数（数件〜数十件オーダー）を前提にした素朴な
 * 実装であり、将来的に規模が増えたらキュー（Cloudflare Queues 等）への
 * 切り出しが必要になる。
 */
export async function sendMarketingCampaignAction(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const admin = await requireAdmin();

  if (!emailEnabled()) {
    return { ok: false, error: "RESEND_API_KEY が未設定のため送信できません。" };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("body") ?? "").trim();
  const testOnly = formData.get("testOnly") === "on" || formData.get("testOnly") === "true";
  if (!subject || !bodyText) {
    return { ok: false, error: "件名と本文を入力してください。" };
  }
  if (subject.length > 200 || bodyText.length > 20000) {
    return { ok: false, error: "件名または本文が長すぎます。" };
  }

  // 素朴な改行→段落変換（リッチエディタは無いため、プレーンテキストで書いて
  // もらう前提。HTMLタグは無害化せずそのままにはしない = escapeしてから改行変換）。
  const escaped = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const bodyHtml = escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="font-size:14px;line-height:1.85;margin:0 0 16px;">${para.replace(/\n/g, "<br />")}</p>`)
    .join("");

  const allUsers = await userRepo.list();
  const recipients = testOnly
    ? allUsers.filter((u) => u.id === admin.id)
    : allUsers.filter((u) => u.marketingConsent && u.status === "active");

  if (recipients.length === 0) {
    return { ok: false, error: testOnly ? "テスト送信先（自分自身）が見つかりません。" : "配信に同意している会員がいません。" };
  }

  const CAP = 500; // 暴走防止の安全弁（現状の会員規模なら実質無制限）
  const targets = recipients.slice(0, CAP);

  let sent = 0;
  let failed = 0;
  for (const u of targets) {
    // 配信停止トークン未発行（同意済みだが旧レコード等で欠けているケース）は
    // その場で発行して保存 — リンク切れの広告メールを送らないための最終防御。
    let token = u.unsubscribeToken;
    if (!token) {
      token = crypto.randomUUID();
      await userRepo.upsert({ ...u, unsubscribeToken: token });
    }
    const html = marketingShell(subject, bodyHtml, unsubscribeUrl(u.id, token));
    const ok = await sendEmail({ to: u.email, subject, html });
    if (ok) sent++;
    else failed++;
  }

  return { ok: true, sent, failed, skipped: recipients.length - targets.length };
}
