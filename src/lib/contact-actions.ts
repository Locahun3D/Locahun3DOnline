"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { contactRequestRepo, CONTACT_TYPES, CONTACT_TYPE_LABEL, type ContactType } from "./contact-requests";
import { notifyGeneralContact } from "./email";
import {
  HONEYPOT_FIELD,
  RENDERED_AT_FIELD,
  isHoneypotTripped,
  checkTiming,
  allowByRate,
} from "./inquiry-guard";

const inputSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  name: z.string().trim().min(1, "お名前を入力してください").max(80),
  email: z.string().trim().email("メールアドレスの形式が正しくありません").max(120),
  company: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  url: z.string().trim().max(300).optional().default(""),
  environment: z.string().trim().max(120).optional().default(""),
  area: z.string().trim().max(120).optional().default(""),
  propertyName: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1, "お問い合わせ内容を入力してください").max(4000),
});

export type ContactState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/**
 * /contact/[type] の各フォームから送信される一般お問い合わせ。
 * 既存の物件問い合わせ（inquiry-actions.ts）と同じ3層スパム対策を再利用する。
 * 認証不要（公開フォーム）。
 */
export async function submitContactRequestAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  if (isHoneypotTripped(formData.get(HONEYPOT_FIELD))) {
    return { ok: true };
  }
  const timing = checkTiming(formData.get(RENDERED_AT_FIELD));
  if (timing === "too-fast") {
    return { ok: true };
  }
  if (timing === "stale") {
    return {
      ok: false,
      error: "フォームの有効期限が切れました。ページを再読み込みのうえ再度お試しください。",
    };
  }

  const parsed = inputSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
    phone: formData.get("phone"),
    url: formData.get("url"),
    environment: formData.get("environment"),
    area: formData.get("area"),
    propertyName: formData.get("propertyName"),
    address: formData.get("address"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "入力内容をご確認ください。";
    return { ok: false, error: first };
  }
  const d = parsed.data;

  let source = "";
  try {
    const { userId } = await auth();
    if (userId) {
      source = `u:${userId}`;
    } else {
      const h = await headers();
      source =
        h.get("cf-connecting-ip") ??
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "";
    }
  } catch {
    // ヘッダ/認証が取れない環境（ローカル等）はレート制限をスキップ。
  }
  if (!allowByRate(source, `contact:${d.type}`)) {
    return {
      ok: false,
      error: "短時間に送信が集中しています。しばらく時間をおいて再度お試しください。",
    };
  }

  const typeLabel = CONTACT_TYPE_LABEL[d.type as ContactType];

  const emailed = await notifyGeneralContact({
    typeLabel,
    name: d.name,
    email: d.email,
    company: d.company,
    phone: d.phone,
    url: d.url,
    environment: d.environment,
    area: d.area,
    propertyName: d.propertyName,
    address: d.address,
    message: d.message,
  });

  try {
    await contactRequestRepo.upsert({
      id: randomUUID(),
      type: d.type,
      name: d.name,
      email: d.email,
      company: d.company,
      phone: d.phone,
      url: d.url,
      environment: d.environment,
      area: d.area,
      propertyName: d.propertyName,
      address: d.address,
      message: d.message,
      forwardedTo: emailed ? "operator" : "",
      emailed,
      status: "new",
      createdAt: new Date().toISOString(),
    });
  } catch {
    if (!emailed) {
      return {
        ok: false,
        error: "送信に失敗しました。お手数ですが時間をおいて再度お試しください。",
      };
    }
  }

  return { ok: true };
}
