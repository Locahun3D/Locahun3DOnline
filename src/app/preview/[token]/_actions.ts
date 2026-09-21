"use server";

import { revalidatePath } from "next/cache";
import { repo } from "@/lib/store";
import { propertyPreviewRepo, isPreviewExpired } from "@/lib/property-previews";
import { publishablePropertySchema } from "@/lib/schemas";
import { canStudioApprove, markPublished, setStudioConfirmed } from "@/lib/publish-flow";
import { hashStudioApproveKey } from "@/lib/studio-approval";
import { autoCreateStudioVenueSplit } from "@/lib/payouts";
import { notifyStudioApproved } from "@/lib/email";

export type StudioApproveResult =
  | { ok: true; published: boolean; propertyId: string }
  | { ok: false; error: string };

/**
 * スタジオがプレビューの「この内容でOK・公開する」を押したとき（ログイン不要）。
 * 2026-09-21 本人指示「OKボタン押したら自動で公開されるように」。
 *
 * 認可はログインではなく「確認メールのURLに入っていたキー」で行う:
 *   プレビューのトークンが有効 ＋ 公開申請中 ＋ キーのハッシュが物件の記録と一致。
 * 公開に必要な項目が欠けていたら公開はせず、「スタジオ確認済み」だけを記録して運営に知らせる。
 * 社外へのメールは送らない（運営宛の通知のみ）。
 */
export async function studioApproveAction(token: string, key: string): Promise<StudioApproveResult> {
  const preview = await propertyPreviewRepo.get(String(token || ""));
  if (!preview || isPreviewExpired(preview)) {
    return { ok: false, error: "このプレビューリンクは無効か、有効期限が切れています。" };
  }
  const existing = await repo.get(preview.propertyId);
  if (!existing) return { ok: false, error: "物件が見つかりません。" };
  const guard = canStudioApprove(existing, hashStudioApproveKey(String(key || "")));
  if (!guard.ok) return { ok: false, error: guard.error };

  const now = new Date().toISOString();
  const confirmed = setStudioConfirmed(existing, { confirmed: true, now, via: "studio-link" });
  const parsed = publishablePropertySchema.safeParse(confirmed);
  if (!parsed.success) {
    await repo.upsert(confirmed);
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${existing.id}/edit`);
    await notifyStudioApproved({ propertyId: existing.id, title: existing.title, published: false }).catch(() => {});
    return { ok: true, published: false, propertyId: existing.id };
  }
  const published = markPublished(parsed.data, now);
  await repo.upsert({ ...published, publishedAt: published.publishedAt || now });
  try {
    await autoCreateStudioVenueSplit(published.id, published.ownerId);
  } catch {
    /* 分配の自動設定に失敗しても公開は続ける（/admin/payouts で手動対応できる） */
  }
  for (const path of [
    "/", "/properties", "/en/properties",
    `/properties/${published.id}`, `/en/properties/${published.id}`,
    "/admin/properties", `/admin/properties/${published.id}/edit`,
  ]) revalidatePath(path);
  await notifyStudioApproved({ propertyId: published.id, title: published.title, published: true }).catch(() => {});
  return { ok: true, published: true, propertyId: published.id };
}
