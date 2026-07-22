"use server";

import { getCurrentUser } from "@/lib/dal";

/**
 * サーバーアクション用の admin チェック。
 * ⚠ requireAdmin()（= requireRole → redirect("/")）をデータ取得アクションで
 * 使ってはいけない。アクション内の redirect は 303 になり**呼び出し元ページ
 * ごとホームへ飛ぶ**。マウント時に自動で呼ぶアクションだと、非 admin が
 * ページを開いた瞬間に追い出される（studio のエディタで実際に発生）。
 * 読み取りは null を返し、変更系は throw でエラーとして返す。
 */
async function currentAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return u?.role === "admin";
}

async function assertAdmin(): Promise<void> {
  if (!(await currentAdmin())) throw new Error("forbidden");
}
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
  await assertAdmin();
  const p = await repo.get(propertyId);
  if (!p) return { ok: false, error: "物件が見つかりません" };
  const embed = await propertyEmbedRepo.create(propertyId);
  return { ok: true, embed };
}

export async function getPropertyEmbedAction(
  propertyId: string,
): Promise<PropertyEmbed | null> {
  if (!(await currentAdmin())) return null;
  return propertyEmbedRepo.findByProperty(propertyId);
}

export async function setPropertyEmbedEnabledAction(
  token: string,
  enabled: boolean,
): Promise<{ ok: boolean; embed: PropertyEmbed | null }> {
  await assertAdmin();
  const embed = await propertyEmbedRepo.setEnabled(token, enabled);
  return { ok: !!embed, embed };
}

export async function revokePropertyEmbedAction(
  propertyId: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  await propertyEmbedRepo.removeByProperty(propertyId);
  return { ok: true };
}
