"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { repo as propertyRepo } from "./store";
import { inquiryRepo } from "./inquiries";
import { notifyInquiry } from "./email";

const inputSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().trim().min(1, "お名前を入力してください").max(80),
  company: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email("メールアドレスの形式が正しくありません").max(120),
  phone: z.string().trim().max(40).optional().default(""),
  purpose: z.string().trim().max(60).optional().default(""),
  preferredDate: z.string().trim().max(20).optional().default(""),
  message: z.string().trim().min(1, "お問い合わせ内容を入力してください").max(4000),
});

export type InquiryState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/**
 * 公開フォームからのスタジオ問い合わせを受け、(1) 必ず保存し、(2) 先方メールへ転送する。
 * 認証不要（公開フォーム）。保存が成功すれば lead は失われないので成功扱いにし、
 * メール転送の成否は記録に残す（Resend キー未設定でも UI は成功）。
 */
export async function submitInquiryAction(
  _prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  const parsed = inputSchema.safeParse({
    propertyId: formData.get("propertyId"),
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    purpose: formData.get("purpose"),
    preferredDate: formData.get("preferredDate"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "入力内容をご確認ください。";
    return { ok: false, error: first };
  }
  const d = parsed.data;

  const property = await propertyRepo.get(d.propertyId);
  if (!property) {
    return { ok: false, error: "対象のスタジオが見つかりませんでした。" };
  }

  // 1) 先方メールへ転送（キー未設定なら false）。
  const emailed = await notifyInquiry({
    propertyTitle: property.title,
    studioEmail: property.contactEmail,
    name: d.name,
    company: d.company,
    fromEmail: d.email,
    phone: d.phone,
    purpose: d.purpose,
    preferredDate: d.preferredDate,
    message: d.message,
  });

  // 2) 必ず記録（メール不可でも運営が後から確認できる）。
  try {
    await inquiryRepo.upsert({
      id: randomUUID(),
      propertyId: property.id,
      propertyTitle: property.title,
      name: d.name,
      company: d.company,
      email: d.email,
      phone: d.phone,
      purpose: d.purpose,
      preferredDate: d.preferredDate,
      message: d.message,
      forwardedTo: property.contactEmail,
      emailed,
      status: "new",
      createdAt: new Date().toISOString(),
    });
  } catch {
    // 保存に失敗してもメールが飛んでいれば lead は届いている。
    if (!emailed) {
      return {
        ok: false,
        error: "送信に失敗しました。お手数ですが時間をおいて再度お試しください。",
      };
    }
  }

  return { ok: true };
}
