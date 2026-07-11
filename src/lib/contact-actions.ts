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
  // 匿名送信を許可するため、どちらも任意（未入力可）。email は入力された
  // 場合のみ形式チェックする — 空文字は z.string().email() 単体では弾けない
  // ため、空文字を許可した上で非空時だけ正規表現で検証する。
  name: z.string().trim().max(80).optional().default(""),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default("")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "メールアドレスの形式が正しくありません",
    }),
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

  // type ごとにフォームへ出していないフィールドは要素自体がDOMに無いため、
  // formData.get() が null を返す（未入力の空文字とは別扱い）。z.string() は
  // null を受け付けないので、ここで空文字に正規化してから渡す。
  const str = (key: string) => formData.get(key)?.toString() ?? "";
  const parsed = inputSchema.safeParse({
    type: str("type"),
    name: str("name"),
    email: str("email"),
    company: str("company"),
    phone: str("phone"),
    url: str("url"),
    environment: str("environment"),
    area: str("area"),
    propertyName: str("propertyName"),
    address: str("address"),
    message: str("message"),
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
