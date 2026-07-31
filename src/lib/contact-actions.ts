"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { contactRequestRepo, CONTACT_TYPES, CONTACT_TYPE_LABEL, type ContactType } from "./contact-requests";
import { notifyGeneralContact } from "./email";
import { requestPublishAction } from "@/app/admin/_actions";
import { userRepo } from "./users";
import { createNotification } from "./notifications";
import { propertyPublicUrl } from "./listing-funnel";
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
  // 掲載依頼を「エディターからの公開申請」として送る場合に付く物件ID。
  // ⚠ 値は信用しない。所有者かどうかは下の requestPublishAction 側で検証する
  //    （assertPropertyAccess が他人の物件を弾く）。
  const propertyId = str("propertyId").trim();
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

  // ⚠ 画像添付はバグ報告専用の入口だった。バグ報告の受付を終了したので
  //    添付の受け取りも撤去した（2026-07-29）。保存済みレコードの
  //    attachments はそのまま残り、管理画面では従来どおり表示される。
  const attachments: string[] = [];

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
      // ⚠ フォームから来た値は使わない。読み取り専用欄でも改竄できるので、
      //    所有者検証を通った propertyId から必ずサーバー側で組み立てる。
      publicUrl: propertyId ? propertyPublicUrl(propertyId) : "",
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

  // エディターから「公開を申請」で来た場合は、フォーム送信をもって申請確定とする。
  // ボタンを押しただけでは申請にならない（押して離脱した人が「申請したつもり」に
  // なるのを防ぐ）。所有者以外の propertyId は requestPublishAction が弾く。
  if (propertyId && d.type === "listing") {
    try {
      await requestPublishAction(propertyId);
    } catch (e) {
      // 申請に失敗しても問い合わせ自体は成立させる（運営には内容が届いている）。
      console.error("[contact] 公開申請の連動に失敗:", e);
    }
  }

  return { ok: true, hasEmail: !!d.email?.trim() };
}
