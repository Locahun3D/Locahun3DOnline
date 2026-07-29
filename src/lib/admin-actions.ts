"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "./dal";
import { userRepo } from "./users";
import { purchaseRepo } from "./purchases";
import { inquiryRepo, type InquiryStatus } from "./inquiries";
import { contactRequestRepo, CONTACT_TYPE_LABEL, type ContactStatus } from "./contact-requests";
import { contactMessageRepo } from "./contact-messages";
import { track } from "./analytics";
import { stripeEnabled, getStripe } from "./stripe";
import { notifyRefund, notifyInquiryReply, notifyContactReply } from "./email";
import { voidPayoutAccrualsForPurchase } from "./payouts";
import { createNotification } from "./notifications";
import { jstDayKey } from "./date-format";
import { rejectNotice } from "./account-reject-reasons";
import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  oneYearFrom,
  type AccountRole,
  type AccountStatus,
  type User,
} from "./account-schema";

/**
 * Approve a pending studio / production account. rejectAccountAction と対称に、
 * production の承認は申請者へアプリ内通知する（studio の承認は申請フローが
 * 別にあり通知不要のため production のみに絞る）。
 */
export async function approveAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const u = await userRepo.get(id);
  // 承認は「保留中」アカウントのみ。停止中(suspended)を承認で復活させない。
  if (!u || u.status !== "pending") return;
  await userRepo.upsert({ ...u, status: "active" });
  if (u.role === "production") {
    await createNotification({
      userId: u.id,
      type: "production_status",
      title: "制作会社アカウントが承認されました",
      body: "制作会社（NDA）アカウントへの切り替えが承認されました。機密ロケ地の閲覧など、対象機能をご利用いただけます。",
      link: "/account",
    }).catch(() => {});
  }
  revalidatePath("/admin/accounts");
}

/**
 * 制作会社（production）アカウントの申請を却下する。
 * 却下＝ role を individual に戻して即 active 化する（宙ぶらりんの
 * 「保留中」のまま放置しない）。NDA同意は申請時に自己申告で記録されて
 * いるため、却下時にクリアする。申請者にはアプリ内通知で結果を伝える
 * （通知失敗で却下処理自体は失敗させない）。
 *
 * ⚠ 通知本文は運営が選んだ却下理由で切り替わる（reason フィールド）。
 *   以前は固定文「今回は見送りとなりました」だけで、しかも遷移先が
 *   再申請ページだったため、申請者は何を直せばよいか分からないまま
 *   同じ内容で再申請できてしまった。文面は account-reject-reasons.ts が正本。
 */
export async function rejectAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const u = await userRepo.get(id);
  if (!u || u.status !== "pending") return;
  await userRepo.upsert({
    ...u,
    role: "individual",
    status: "active",
    ndaAcceptedAt: null,
  });
  const notice = rejectNotice(String(formData.get("reason") ?? ""));
  await createNotification({
    userId: u.id,
    type: "production_status",
    title: notice.title,
    body: notice.body,
    link: notice.link,
  }).catch(() => {});
  revalidatePath("/admin/accounts");
}

/** Set an account's status (active / pending / suspended). */
export async function setAccountStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AccountStatus;
  if (!ACCOUNT_STATUSES.includes(status)) return;
  // 自己ロックアウト防止: 自分を active 以外(停止/保留)にはできない。
  if (id === admin.id && status !== "active") return;
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, status });
  revalidatePath("/admin/accounts");
}

/** Change an account's role (e.g. promote to admin, or fix a mis-signup). */
export async function setAccountRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as AccountRole;
  if (!ACCOUNT_ROLES.includes(role)) return;
  // Guard: don't let an admin demote themselves and lock everyone out.
  if (id === admin.id && role !== "admin") return;
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, role });
  revalidatePath("/admin/accounts");
}

/** Grant or set token balance (manual top-up while Stripe is unwired). */
export async function setTokenBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const balance = Math.max(0, Math.trunc(Number(formData.get("balance") ?? 0)));
  const u = await userRepo.get(id);
  if (!u) return;
  // 付与トークンは1年で失効。残高 0 なら失効予定もクリア。
  const tokenExpiresAt = balance > 0 ? oneYearFrom(new Date().toISOString()) : null;
  await userRepo.upsert({ ...u, tokenBalance: balance, tokenExpiresAt });
  revalidatePath("/admin/accounts");
}

/** Delete an account (cannot delete yourself). */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id === admin.id) return;
  await userRepo.remove(id);
  revalidatePath("/admin/accounts");
}

/** 管理者が特定ユーザーの特定セッション（端末）を強制失効させる。 */
export async function revokeUserSessionAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!userId || !sessionId) return;
  const client = await clerkClient();
  await client.sessions.revokeSession(sessionId).catch(() => {});
  revalidatePath(`/admin/accounts/${userId}/sessions`);
}

/** 一括: 選択アカウントの status をまとめて変更。 */
export async function bulkSetAccountStatusAction(
  ids: string[],
  status: AccountStatus,
) {
  const admin = await requireAdmin();
  if (!ACCOUNT_STATUSES.includes(status)) return { ok: false as const };
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    // 自己ロックアウト防止: 自分を active 以外には一括変更しない。
    if (id === admin.id && status !== "active") {
      skipped.push(id);
      continue;
    }
    const u = await userRepo.get(id);
    if (!u) {
      skipped.push(id);
      continue;
    }
    await userRepo.upsert({ ...u, status });
    done++;
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: done, total: ids.length, skipped };
}

/** 対象ユーザー群にトークンを加算付与する共通処理（上書きではなく加算）。 */
async function grantTokensTo(targets: User[], grant: number) {
  const now = new Date().toISOString();
  for (const u of targets) {
    await userRepo.upsert({
      ...u,
      tokenBalance: u.tokenBalance + grant,
      // 付与分の失効を1年後まで延長（既存の setTokenBalanceAction と同じ扱い）。
      tokenExpiresAt: oneYearFrom(now),
    });
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: targets.length, grant };
}

/**
 * 一括: 現在 plan==="free" の全アカウントにトークンを加算付与する。
 * SIGNUP_BONUS_TOKENS を 1→6 に修正した際、修正前に登録済みだったフリー
 * プランユーザーは古い残高のまま取り残されていた（新規登録者のみ恩恵を受ける
 * 状態）。その差分を埋めるための一回きりの救済付与。
 * 付与量は加算（既存残高に amount を足す）。0件対象でも成功として返す。
 */
export async function bulkGrantFreeTokensAction(amount: number) {
  await requireAdmin();
  const grant = Math.max(0, Math.trunc(amount));
  if (grant <= 0) return { ok: false as const };
  const all = await userRepo.list();
  return grantTokensTo(all.filter((u) => u.plan === "free"), grant);
}

/**
 * 一括: 選択したアカウント（プラン不問）にトークンを加算付与する汎用版。
 * 1件だけ選択すれば実質「特定アカウントへの加算付与」としても使える
 * （既存の個別「上書き」フィールドとは別に、加算だけしたい場合はこちらを使う）。
 */
export async function bulkGrantTokensAction(ids: string[], amount: number) {
  await requireAdmin();
  const grant = Math.max(0, Math.trunc(amount));
  if (grant <= 0 || ids.length === 0) return { ok: false as const };
  const targets: User[] = [];
  for (const id of ids) {
    const u = await userRepo.get(id);
    if (u) targets.push(u);
  }
  return grantTokensTo(targets, grant);
}

/** Link a studio owner account to a set of property IDs they can manage. */
export async function linkPropertiesToUserAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const propertyIdsRaw = String(formData.get("propertyIds") ?? "");
  const propertyIds = propertyIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const u = await userRepo.get(id);
  if (!u) return;
  await userRepo.upsert({ ...u, linkedPropertyIds: propertyIds });
  revalidatePath("/admin/accounts");
}

/** 一括: 選択アカウントを削除 (自分自身は除外)。 */
export async function bulkDeleteAccountsAction(ids: string[]) {
  const admin = await requireAdmin();
  let done = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    if (id === admin.id) {
      skipped.push(id); // 自分自身は削除できない
      continue;
    }
    await userRepo.remove(id);
    done++;
  }
  revalidatePath("/admin/accounts");
  return { ok: true as const, count: done, total: ids.length, skipped };
}

/** 問い合わせの状態を変更（new / read / archived）。 */
export async function setInquiryStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as InquiryStatus;
  if (!["new", "read", "archived"].includes(status)) return;
  const i = await inquiryRepo.get(id);
  if (!i) return;
  await inquiryRepo.upsert({ ...i, status });
  revalidatePath("/admin/inquiries");
}

/** 問い合わせを削除。 */
export async function deleteInquiryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await inquiryRepo.remove(id);
  revalidatePath("/admin/inquiries");
}

export type ReplyInquiryState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/**
 * 問い合わせにアプリ内から返信する。メールが主経路（匿名送信もあるため）。
 * 送信時にサインインしていたユーザーには、加えてアプリ内通知も作成する。
 */
export async function replyToInquiryAction(
  _prev: ReplyInquiryState,
  formData: FormData,
): Promise<ReplyInquiryState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!reply) return { ok: false, error: "返信内容を入力してください。" };
  if (reply.length > 4000) return { ok: false, error: "返信内容が長すぎます。" };

  const i = await inquiryRepo.get(id);
  if (!i) return { ok: false, error: "対象の問い合わせが見つかりませんでした。" };

  const emailed = await notifyInquiryReply({
    to: i.email,
    propertyTitle: i.propertyTitle,
    originalMessage: i.message,
    reply,
  });

  await inquiryRepo.upsert({
    ...i,
    reply,
    repliedAt: new Date().toISOString(),
    status: i.status === "new" ? "read" : i.status,
  });

  if (i.userId) {
    await createNotification({
      userId: i.userId,
      type: "inquiry_reply",
      title: `「${i.propertyTitle}」への問い合わせに返信がありました`,
      body: reply,
      link: `/properties/${i.propertyId}`,
    }).catch(() => {});
  }

  if (!emailed && !i.userId) {
    // メールも通知も届かない場合だけ警告する（少なくとも片方は届く想定）。
    return {
      ok: false,
      error: "返信を保存しましたが、メール送信に失敗しました（RESEND未設定の可能性）。相手には届いていません。",
    };
  }

  revalidatePath("/admin/inquiries");
  return { ok: true };
}

/** 一般お問い合わせ(/contact)の状態を変更（new / read / archived）。 */
export async function setContactRequestStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as ContactStatus;
  if (!["new", "read", "archived"].includes(status)) return;
  const c = await contactRequestRepo.get(id);
  if (!c) return;
  await contactRequestRepo.upsert({ ...c, status });
  revalidatePath("/admin/contact-requests");
}

/** 一般お問い合わせ(/contact)を削除。 */
export async function deleteContactRequestAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await contactRequestRepo.remove(id);
  revalidatePath("/admin/contact-requests");
}

/**
 * 一般お問い合わせ(/contact)にアプリ内から返信する。相手の連絡先はメールのみ
 * （userId を記録していない匿名フォーム）なので、メール送信が唯一の到達経路。
 * 差出人は contact@（notifyContactReply 側で replyFromAddress を使用）。
 */
export async function replyToContactRequestAction(
  _prev: ReplyInquiryState,
  formData: FormData,
): Promise<ReplyInquiryState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reply = String(formData.get("reply") ?? "").trim();
  if (!reply) return { ok: false, error: "返信内容を入力してください。" };
  if (reply.length > 4000) return { ok: false, error: "返信内容が長すぎます。" };

  const c = await contactRequestRepo.get(id);
  if (!c) return { ok: false, error: "対象のお問い合わせが見つかりませんでした。" };
  if (!c.email) {
    return { ok: false, error: "メールアドレス未記入のお問い合わせには返信できません。" };
  }

  const emailed = await notifyContactReply({
    to: c.email,
    typeLabel: CONTACT_TYPE_LABEL[c.type],
    originalMessage: c.message,
    reply,
  });

  await contactRequestRepo.upsert({
    ...c,
    reply,
    repliedAt: new Date().toISOString(),
    replyEmailed: emailed,
    status: c.status === "new" ? "read" : c.status,
  });

  // メールスレッド(contact_messages)にも追記して、管理画面に返信履歴を残す。
  // （お客様からの返信の取り込みは未実装。docs/inbound-email-decision-2026-07-28.md）
  // 失敗しても返信自体（上のupsert＋メール送信）は成立させる。
  try {
    await contactMessageRepo.append({
      direction: "outbound",
      counterpart: c.email,
      fromEmail: "contact@locahun3d.com",
      toEmail: c.email,
      subject: `Re:【ロケハン3D】お問い合わせへのご返信（${CONTACT_TYPE_LABEL[c.type]}）`,
      bodyText: reply,
      source: "admin-ui",
    });
  } catch (e) {
    console.error("[contact] スレッド追記に失敗（返信処理は継続）:", e);
  }

  if (!emailed) {
    return {
      ok: false,
      error: "返信を保存しましたが、メール送信に失敗しました（RESEND未設定の可能性）。相手には届いていません。",
    };
  }

  revalidatePath("/admin/contact-requests");
  return { ok: true };
}

/** 購入を返金処理する。 */
export async function refundPurchaseAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const p = await purchaseRepo.get(id);
  if (!p || p.status !== "completed") return;

  // 実決済（Stripe）が紐づく購入は、Stripe側でも実返金してから記録を更新する。
  // 返金が失敗したら記録は completed のまま残す（金銭未返却の状態を防ぐ）。
  if (stripeEnabled() && p.stripeSessionId) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(p.stripeSessionId);
      const pi =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (pi) {
        await stripe.refunds.create({ payment_intent: pi });
      }
    } catch {
      // Stripe返金に失敗 → 記録を refunded にせず終了（再試行可能）。
      return;
    }
  }

  const refunded = await purchaseRepo.upsert({
    ...p,
    status: "refunded",
    refundedAt: new Date().toISOString(),
    refundReason: reason,
  });
  const day = jstDayKey();
  await track(p.propertyId, "refund", "", day, "desktop", p.priceYen);
  await notifyRefund(refunded);
  // 返金確定 → 分配台帳の未精算(accrued)行を voided に。settled 済み(精算対象に
  // 既に入った行)は Phase 1 では触らない（マイナス調整は Phase 2）。
  await voidPayoutAccrualsForPurchase(refunded.id);
  revalidatePath("/admin/purchases");
}

/**
 * 購入記録を完全削除（テスト購入の掃除用・管理者専用）。
 * 安全側: 実決済が紐づく "completed"（未返金）の購入は削除させない。
 * 削除してよいのは refunded / cancelled / pending、または Stripe 紐付けの無い
 * テスト即時完了の購入のみ。
 */
export async function deletePurchaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const p = await purchaseRepo.get(id);
  if (!p) return;
  // 実入金が残っている可能性のある購入（Stripe紐付け＋completed）は削除不可。
  // 先に返金してから削除する運用にする。
  if (p.status === "completed" && p.stripeSessionId) return;
  await purchaseRepo.remove(id);
  revalidatePath("/admin/purchases");
}

/** 削除可能か: 実入金が残り得る (Stripe紐付き completed) 以外は掃除対象。 */
function isDeletablePurchase(p: { status: string; stripeSessionId?: string }): boolean {
  return !(p.status === "completed" && !!p.stripeSessionId);
}

/**
 * テスト購入の一括削除（管理者専用）。
 * Stripe紐付きの未返金「完了」だけ残し、それ以外（返金済・処理中・キャンセル・
 * テスト即時完了）をまとめて削除する。
 */
export async function bulkDeleteTestPurchasesAction(): Promise<void> {
  await requireAdmin();
  const all = await purchaseRepo.list();
  const targets = all.filter(isDeletablePurchase);
  for (const p of targets) {
    await purchaseRepo.remove(p.id);
  }
  revalidatePath("/admin/purchases");
}

