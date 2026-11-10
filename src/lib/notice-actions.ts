"use server";

import { requireAdmin } from "./dal";
import { userRepo } from "./users";
import { purchaseRepo } from "./purchases";
import { emailEnabled } from "./email";
import { mailShell } from "./mail-shell";
import { getSettings, saveSettings } from "./site-settings";
import { selectNoticeRecipients, noticeBodyToHtml, chunk, NOTICE_BATCH_SIZE } from "./notice-mail";

/**
 * ダウンロード経験者全員への「お知らせ」（取引上の通知。利用条件の改定など）。
 * 経緯と注意は notice-mail.ts の冒頭を参照。宣伝はこの経路で送らない。
 *
 * 送信は Resend の batch API（1回100通）。1通ずつ送ると 2,000 通超で Workers の
 * サブリクエスト上限に当たるため。Resend の既定レート（毎秒2回）に合わせて間を空ける。
 * 途中で失敗したら、その位置（何番目から）を返し、画面から続きを送れるようにする。
 */

export type NoticeState =
  | undefined
  | { ok: true; test: boolean; sent: number; failed: number; total: number; nextOffset: number | null; error?: string }
  | { ok: false; error: string };

const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fromAddress(): string {
  return process.env.EMAIL_FROM || "ロケハン3D <noreply@locahun3d.com>";
}

/** 件名＋位置から作る冪等キー（ボタンの二度押しや再送で同じ束を二重に出さない。Resend は24時間有効）。 */
async function idempotencyKey(subject: string, offset: number): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  const hex = [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `notice-${hex}-${offset}`;
}

export async function sendDownloaderNoticeAction(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const admin = await requireAdmin();
  if (!emailEnabled()) return { ok: false, error: "RESEND_API_KEY が未設定のため送信できません。" };

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("body") ?? "").trim();
  const testOnly = formData.get("testOnly") === "on";
  const resend = formData.get("allowResend") === "on";
  const offset = Math.max(0, Math.floor(Number(formData.get("offset") ?? 0)) || 0);
  if (!subject || !bodyText) return { ok: false, error: "件名と本文を入力してください。" };
  if (subject.length > 200 || bodyText.length > 20000) return { ok: false, error: "件名または本文が長すぎます。" };

  const html = mailShell(subject, noticeBodyToHtml(bodyText));
  const key = process.env.RESEND_API_KEY!;

  if (testOnly) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [admin.email], subject: `[テスト] ${subject}`, html }),
    }).catch(() => null);
    return res?.ok
      ? { ok: true, test: true, sent: 1, failed: 0, total: 1, nextOffset: null }
      : { ok: false, error: `テスト送信に失敗しました（${res?.status ?? "通信エラー"}）。` };
  }

  // 同じ件名を最初から送り直すのを止める（続きから＝offset>0 は許可）。
  const settings = await getSettings();
  const already = settings.noticeLog.find((l) => l.subject === subject && l.sent > 0);
  if (already && offset === 0 && !resend) {
    return {
      ok: false,
      error: `この件名は ${already.sentAt.slice(0, 16).replace("T", " ")} に ${already.sent} 件送信済みです。もう一度送るなら「同じ件名でも送る」にチェックしてください。`,
    };
  }

  const [purchases, users] = await Promise.all([purchaseRepo.list({ status: "completed" }), userRepo.list()]);
  const all = selectNoticeRecipients(purchases, users);
  const targets = all.slice(offset);
  if (targets.length === 0) return { ok: false, error: "送信先がありません。" };

  let sent = 0;
  let failed = 0;
  let nextOffset: number | null = null;
  let error: string | undefined;
  const batches = chunk(targets, NOTICE_BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    const batchOffset = offset + i * NOTICE_BATCH_SIZE;
    const batch = batches[i];
    const res = await fetch(RESEND_BATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": await idempotencyKey(subject + (resend ? `#${admin.id}-${Date.now()}` : ""), batchOffset),
      },
      body: JSON.stringify(batch.map((r) => ({ from: fromAddress(), to: [r.email], subject, html }))),
    }).catch(() => null);
    if (!res?.ok) {
      // 束ごと失敗（Resend の batch は全部か無し）。ここで止めて、続きの位置を返す。
      failed = all.length - batchOffset;
      nextOffset = batchOffset;
      error = `${batchOffset + 1} 件目からの送信に失敗しました（${res?.status ?? "通信エラー"}${res ? `: ${(await res.text().catch(() => "")).slice(0, 160)}` : ""}）。`;
      break;
    }
    sent += batch.length;
    if (i < batches.length - 1) await sleep(600);
  }

  const log = { subject, sentAt: new Date().toISOString(), sent, failed, total: all.length };
  await saveSettings({ ...settings, noticeLog: [log, ...settings.noticeLog].slice(0, 50) }).catch(() => {});

  return { ok: true, test: false, sent, failed, total: all.length, nextOffset, error };
}
