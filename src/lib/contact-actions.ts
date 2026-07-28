"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { contactRequestRepo, CONTACT_TYPES, CONTACT_TYPE_LABEL, type ContactType } from "./contact-requests";
import { saveContactAttachment } from "./uploads";
import { notifyGeneralContact } from "./email";
import { userRepo } from "./users";
import { createNotification } from "./notifications";
import {
  HONEYPOT_FIELD,
  RENDERED_AT_FIELD,
  isHoneypotTripped,
  checkTiming,
  allowByRate,
} from "./inquiry-guard";

// バグ報告の画像添付の上限（クライアント側 contact-form.tsx と揃えること）
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
  environment: z.string().trim().max(200).optional().default(""),
  area: z.string().trim().max(120).optional().default(""),
  propertyName: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1, "お問い合わせ内容を入力してください").max(4000),
});

// 掲載依頼(listing)は担当者へ連絡が取れないと案内を進められないため、
// ご担当者名・メールアドレスを必須にする（他 type は匿名送信を維持）。
const listingContactSchema = inputSchema
  .extend({
    name: z.string().trim().min(1, "ご担当者名を入力してください").max(80),
    email: z
      .string()
      .trim()
      .min(1, "メールアドレスを入力してください")
      .max(120)
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
        message: "メールアドレスの形式が正しくありません",
      }),
  });

export type ContactState =
  /** hasEmail: 返信先メールが入力されていたか。完了画面の文言分岐に使う。
   *  ⚠ クライアントで emailRef.current を読んで判定していたが、レンダー中に
   *     ref を読むのは不正（コミット前の値を見る可能性がある）。受け取った
   *     サーバー側が事実を返す形にした。 */
  | { ok: true; hasEmail: boolean }
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
    return { ok: true, hasEmail: false };
  }
  const timing = checkTiming(formData.get(RENDERED_AT_FIELD));
  if (timing === "too-fast") {
    return { ok: true, hasEmail: false };
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
  const raw = {
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
  };
  const parsed =
    raw.type === "listing" ? listingContactSchema.safeParse(raw) : inputSchema.safeParse(raw);
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
  const id = randomUUID();

  // バグ報告のみ画像添付を受け付ける（匿名フォームなので上限を厳格に）。
  // 個々の保存失敗で報告全体を落とさない — 保存できた分だけ添付する。
  const attachments: string[] = [];
  if (d.type === "bug") {
    const files = formData
      .getAll("attachments")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_ATTACHMENTS) {
      return { ok: false, error: `画像の添付は最大 ${MAX_ATTACHMENTS} 枚までです。` };
    }
    for (const file of files) {
      if (!ATTACHMENT_TYPES.includes(file.type)) {
        return { ok: false, error: "添付できるのは画像（JPEG / PNG / WebP / GIF）のみです。" };
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return {
          ok: false,
          error: `画像1枚あたりのサイズ上限は ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB です。`,
        };
      }
    }
    for (const file of files) {
      try {
        const saved = await saveContactAttachment(id, file);
        attachments.push(saved.url);
      } catch (e) {
        console.warn("[contact] attachment save failed (non-fatal):", e);
      }
    }
  }

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
    attachments,
  });

  try {
    await contactRequestRepo.upsert({
      id,
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
      attachments,
      forwardedTo: emailed ? "operator" : "",
      emailed,
      reply: "",
      repliedAt: null,
      replyEmailed: false,
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

  // 全adminへアプリ内通知（メール転送はRESEND未設定だと届かないため、
  // 気づける経路をもう1本置く）。通知失敗で公開フォームは落とさない。
  try {
    const admins = (await userRepo.list()).filter((u) => u.role === "admin");
    for (const a of admins) {
      await createNotification({
        userId: a.id,
        type: "contact_request",
        title: `【${typeLabel}】新しいお問い合わせが届きました`,
        body: `${d.name || "匿名"} さん: ${d.message.slice(0, 120)}`,
        link: "/admin/contact-requests",
      });
    }
  } catch (e) {
    console.error("[contact] admin通知の作成に失敗（送信処理は継続）:", e);
  }

  return { ok: true, hasEmail: !!d.email?.trim() };
}
