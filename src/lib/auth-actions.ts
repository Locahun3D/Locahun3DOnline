"use server";

import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  onboardingSchema,
  requiresApproval,
  requiresNda,
  type ActionState,
} from "./account-schema";
import { userRepo } from "./users";
import { getCurrentUser } from "./dal";

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

  // Ensure the app record exists (getCurrentUser creates it on first visit).
  await getCurrentUser();
  const u = await userRepo.get(userId);
  if (!u) redirect("/sign-in");

  const status = requiresApproval(d.role) ? "pending" : "active";
  await userRepo.upsert({
    ...u,
    role: d.role,
    company: d.company ?? "",
    phone: d.phone ?? "",
    status,
    onboarded: true,
    ndaAcceptedAt: d.nda ? new Date().toISOString() : u.ndaAcceptedAt,
  });

  redirect(status === "pending" ? "/account?welcome=pending" : "/account?welcome=1");
}

/** Record NDA acceptance for the current production account (form action). */
export async function acceptNdaAction(): Promise<void> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.role !== "production") redirect("/account");

  const u = await userRepo.get(current.id);
  if (!u) redirect("/account");
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
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) redirect("/sign-in");
  if (current.role === "production" || current.role === "admin") {
    redirect("/account");
  }
  if (current.status === "pending") {
    redirect("/account?upgrade=pending");
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

  redirect("/account?welcome=pending");
}
