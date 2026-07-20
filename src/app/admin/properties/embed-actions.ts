"use server";

import { requireAdmin } from "@/lib/dal";
import { repo } from "@/lib/store";
import { propertyEmbedRepo, type PropertyEmbed } from "@/lib/property-embeds";

/**
 * 掲載者サイト埋め込み用URLの発行/取得/停止・再開/失効
 * （DECISION_LOG D-008 のホスティング商品）。
 *
 * preview-actions と同型だが、埋め込みは期限を持たない代わりに
 * enabled で一時停止できる。停止(setEnabled false)と失効(revoke=行削除)は
 * 別物: 停止は同じURLで再開できるが、失効はURL自体を無効化するので
 * 掲載者側の貼り替えが必要になる。
 */

export async function createPropertyEmbedAction(
  propertyId: string,
): Promise<{ ok: true; embed: PropertyEmbed } | { ok: false; error: string }> {
  await requireAdmin();
  const p = await repo.get(propertyId);
  if (!p) return { ok: false, error: "物件が見つかりません" };
  const embed = await propertyEmbedRepo.create(propertyId);
  return { ok: true, embed };
}

export async function getPropertyEmbedAction(
  propertyId: string,
): Promise<PropertyEmbed | null> {
  await requireAdmin();
  return propertyEmbedRepo.findByProperty(propertyId);
}

export async function setPropertyEmbedEnabledAction(
  token: string,
  enabled: boolean,
): Promise<{ ok: boolean; embed: PropertyEmbed | null }> {
  await requireAdmin();
  const embed = await propertyEmbedRepo.setEnabled(token, enabled);
  return { ok: !!embed, embed };
}

export async function revokePropertyEmbedAction(
  propertyId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  await propertyEmbedRepo.removeByProperty(propertyId);
  return { ok: true };
}
