"use server";

import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import {
  propertyPreviewRepo,
  type PropertyPreview,
} from "@/lib/property-previews";

/**
 * 物件の限定プレビュー共有URL(先方スタジオへの公開前確認用)の発行/取得/失効。
 * すべて requireAdmin 経由。既定30日で失効し、再発行で URL を更新できる。
 */

export async function createPropertyPreviewAction(
  propertyId: string,
): Promise<
  | { ok: true; preview: PropertyPreview }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const p = await repo.get(propertyId);
  if (!p) return { ok: false, error: "物件が見つかりません" };
  const preview = await propertyPreviewRepo.create({ propertyId });
  return { ok: true, preview };
}

export async function getPropertyPreviewAction(
  propertyId: string,
): Promise<PropertyPreview | null> {
  await requireAdmin();
  return propertyPreviewRepo.findByProperty(propertyId);
}

export async function revokePropertyPreviewAction(
  propertyId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  await propertyPreviewRepo.removeByProperty(propertyId);
  return { ok: true };
}
