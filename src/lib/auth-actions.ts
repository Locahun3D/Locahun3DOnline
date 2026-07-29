"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  onboardingSchema,
  requiresApproval,
  requiresNda,
  type ActionState,
} from "./account-schema";
import { userRepo } from "./users";
import { createNotification } from "./notifications";
import { getCurrentUser } from "./dal";
import { listActiveSessions } from "./device-limit";
import { isFreeEmailDomain } from "./free-email-domains";

/**
 * requestProductionUpgradeAction 専用の戻り値型。ActionState (redirect前提) と
 * 違い、送信後もページ遷移せずに確認パネルを表示する（scan-submit-form.tsx と
 * 同じパターン）ため ok:true を持つ。
 */
export type ProductionUpgradeState =
  | { ok: true }
  | { ok?: false; errors?: Record<string, string[] | undefined>; message?: string }
  | undefined;

/** Capture role / company / NDA after Clerk sign-up. */
export async function onboardingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const parsed = onboardingSchema.safeParse({
    role: formData.get("role"),
    company: formData.get("company") ?? "",
    phone: formData.get("phone") ?? "",
    nda: formData.get("nda") === "on" || formData.get("nda") === "true",
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  if (requiresNda(d.role) && !d.nda) {
    return { errors: { nda: ["NDA への同意が必要です"] } };
  }
  const marketingConsent =
    formData.get("marketingConsent") === "on" || formData.get("marketingConsent") === "true";

  // Ensure the app record exists (getCurrentUser creates it on first visit).
  await getCurrentUser();
  const u = await userRepo.get(userId);
  if (!u) redirect("/sign-in");

  // NDA(制作会社)アカウントは会社実在の裏付けとして会社メールドメインを必須化。
  // フォーム上のロール選択時点では気づけないため、送信時にここで弾く
  // （/onboarding のUIにも同じ注記を静的に表示済み）。
  if (requiresNda(d.role) && isFreeEmailDomain(u.email)) {
    return {
      errors: {
        email: [
          "制作会社（NDA）アカウントの登録には会社のメールアドレスが必要です。Gmail・Outlook・Yahooメール等の個人向けメールアドレスでは登録できません。",
        ],
      },
    };
  }

  const status = requiresApproval(d.role) ? "pending" : "active";
  await userRepo.upsert({
    ...u,
    role: d.role,
    company: d.company ?? "",
    phone: d.phone ?? "",
    status,
    onboarded: true,
    ndaAcceptedAt: d.nda ? new Date().toISOString() : u.ndaAcceptedAt,
    marketingConsent,
    marketingConsentAt: marketingConsent ? new Date().toISOString() : null,
    unsubscribeToken: marketingConsent && !u.unsubscribeToken ? crypto.randomUUID() : u.unsubscribeToken,
  });

  redirect(status === "pending" ? "/account?welcome=pending" : "/account?welcome=1");
}

/** 制御文字（改行等含む）と、なりすまし・視認妨害に使われるゼロ幅系文字。 */
const DISPLAY_NAME_STRIP_RE =
   
  /[\u0000-\u001f\u007f\u200b-\u200f\u2060\u00ad\u180e\ufeff]/g;

export type DisplayNameState =
  | { ok: true; displayName: string }
  | { ok: false; error: string }
  | undefined;

/**
 * 掲示板に表示する公開表示名の変更（マイページのインライン編集から呼ぶ）。
 * 保存先はユーザーレコード（ndaAcceptedAt 等と同じ D1 users.data）。
 * コメント/レビューは表示時に src/lib/live-names.ts が常にこの値へ解決し
 * 直すため、過去の投稿の表示にも遡って反映される。
 */
export async function updateDisplayNameAction(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const current = await getCurrentUser();
  if (!current) return { ok: false, error: "サインインが必要です。" };

  const raw = String(formData.get("displayName") ?? "");
  const cleaned = raw.replace(DISPLAY_NAME_STRIP_RE, "").trim();
  const len = [...cleaned].length; // コードポイント数（絵文字等の見かけ1文字を尊重）
  if (len < 1 || len > 30) {
    return { ok: false, error: "表示名は1〜30文字で入力してください。" };
  }

  const u = await userRepo.get(current.id);
  if (!u) return { ok: false, error: "アカウントが見つかりませんでした。" };
  await userRepo.upsert({ ...u, displayName: cleaned });
  revalidatePath("/account");
  return { ok: true, displayName: cleaned };
}

/**
 * マイページから、ログイン中の自分の端末（セッション）を1つログアウトさせる。
 * 所有権チェック必須: revoke するのは「そのセッションが本人のアクティブセッション
 * 一覧に実在する」場合のみ。sessionId は他人のものを送られても listActiveSessions
 * が本人のものしか返さないため、ここに無ければ何もしない（他人のセッションを
 * 失効させられない）。現在使用中の端末は UI 側でボタンを出さない運用だが、万一
 * 送られても Clerk 側で普通にサインアウトされるだけで害はない。
 */
export async function revokeMySessionAction(formData: FormData): Promise<void> {
  const current = await getCurrentUser();
  if (!current) return;
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;

  const mine = await listActiveSessions(current.id).catch(() => []);
  if (!mine.some((s) => s.id === sessionId)) return; // 自分のセッションでなければ拒否

  const client = await clerkClient();
  await client.sessions.revokeSession(sessionId).catch(() => {});
  revalidatePath("/account");
}

/** Record NDA acceptance for the current production account (form action). */
export async function acceptNdaAction(): Promise<void> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.role !== "production") redirect("/account?notice=nda-not-production");

  const u = await userRepo.get(current.id);
  if (!u) redirect("/account?notice=account-missing");
  // 防御的チェック: 通常はここに来る時点で申請時の会社メール判定を通過済みだが、
  // 管理者が手動で role="production" に変更した場合はこの検証を経ていないため
  // 二重に確認する（フリーメールでのNDA締結を防ぐ）。
  if (isFreeEmailDomain(u.email)) {
    redirect("/account?nda=blocked");
  }
  await userRepo.upsert({ ...u, ndaAcceptedAt: new Date().toISOString() });
  redirect("/account?nda=1");
}

/**
 * 制作会社（production）アカウントへの昇格申請。
 *
 * onboarding は初回サインイン時の一回きりのフローなので、個人/スタジオとして
 * 登録済みのユーザーが後から Team プラン・NDA限定閲覧を必要とする場合、
 * このアクションが唯一の自己申請経路になる。production は requiresApproval が
 * 常に true なので、承認されるまでは status="pending"（既存の onboarding 時
 * pending と同じ扱い＝サインインは可能・プロ機能は未解放）。
 * canViewBackyard 等はいずれも status==="active" を要求するため、role を
 * 先に "production" へ切り替えても承認前に閲覧範囲が広がることはない。
 */
export async function requestProductionUpgradeAction(
  _prev: ProductionUpgradeState,
  formData: FormData,
): Promise<ProductionUpgradeState> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.role === "production" || current.role === "admin") {
    redirect("/account?notice=already-production");
  }
  if (current.status === "pending") {
    redirect("/account?notice=upgrade-pending");
  }
  // NDA(制作会社)アカウントは会社実在の裏付けとして会社メールドメインを必須化。
  // /account/upgrade 側でも同じ判定でフォーム自体を隠しているが、直接POSTされた
  // 場合に備えてここでも弾く。
  if (isFreeEmailDomain(current.email)) {
    return {
      errors: {
        email: [
          "制作会社（NDA）アカウントの登録には会社のメールアドレスが必要です。Gmail・Outlook・Yahooメール等の個人向けメールアドレスでは申請できません。",
        ],
      },
    };
  }

  const company = String(formData.get("company") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const nda = formData.get("nda") === "on" || formData.get("nda") === "true";
  if (!company) {
    return { errors: { company: ["制作会社名を入力してください"] } };
  }
  if (!nda) {
    return { errors: { nda: ["NDA への同意が必要です"] } };
  }

  const u = await userRepo.get(current.id);
  if (!u) redirect("/sign-in");
  await userRepo.upsert({
    ...u,
    role: "production",
    status: "pending",
    company,
    phone: phone || u.phone,
    ndaAcceptedAt: new Date().toISOString(),
  });

  // 全adminへアプリ内通知（ヘッダーのベルで新着申請に気づけるように）。
  // 通知作成に失敗しても申請自体は成立させる。
  try {
    const admins = (await userRepo.list()).filter((a) => a.role === "admin");
    for (const a of admins) {
      await createNotification({
        userId: a.id,
        type: "production_request",
        title: "制作会社アカウントの申請が届きました",
        body: `${company}（${u.name || u.email}）から制作会社（NDA）アカウントの申請が届きました。承認/却下をお願いします。`,
        link: "/admin/accounts",
      });
    }
  } catch (e) {
    console.error("[production] admin通知の作成に失敗（申請は継続）:", e);
  }

  return { ok: true };
}

/**
 * ログイン中の個人アカウントを、その場で撮影スタジオへ切り替える。
 *
 * ── なぜ「申請」ではなく即時切り替えなのか ──────────────────
 * 撮影スタジオは SELF_SIGNUP_ROLES＝新規登録時に自己申告で選べる種別で、
 * 審査は元々ない。つまり「別アカウントを作り直して studio を選ぶ」のと
 * 「今のアカウントを studio にする」とで審査の厳しさは変わらない。
 * にもかかわらず掲載依頼ページは常に新規登録へ送っており、しかも
 * ログイン済みだと Clerk がサインアップ画面を出さずマイページへ弾くため、
 * 「スタジオアカウントを作成」を押すと何も起きないように見えていた
 * （ユーザー報告 2026-07-29）。
 *
 * ⚠ 会社ドメインのメールを必須にする。フリーメールのままスタジオを名乗れると
 *   掲載主の実在確認が一切なくなる（制作会社アカウントと同じ基準に揃えた）。
 * ⚠ 対象は individual のみ。production は NDA 締結済みなので切り替えると
 *   権限を失う。admin/studio は変更不要。
 * ⚠ 表示の出し分けは listing-funnel.ts の canConvertToStudio。ここは
 *   直接POSTされた場合の本丸なので、同じ条件を必ず再判定する。
 */
export async function convertToStudioAction(): Promise<void> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.role !== "individual") redirect("/contact/listing");
  if (isFreeEmailDomain(current.email)) redirect("/contact/listing?notice=company-email-required");

  const u = await userRepo.get(current.id);
  if (!u) redirect("/sign-in");
  await userRepo.upsert({ ...u, role: "studio", status: "active" });

  revalidatePath("/contact/listing");
  revalidatePath("/account");
  redirect("/admin/properties");
}
