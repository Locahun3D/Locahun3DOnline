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
  await assertAdmin();
  const p = await repo.get(propertyId);
  if (!p) return { ok: false, error: "物件が見つかりません" };
  const preview = await propertyPreviewRepo.create({ propertyId });
  return { ok: true, preview };
}

export async function getPropertyPreviewAction(
  propertyId: string,
): Promise<PropertyPreview | null> {
  if (!(await currentAdmin())) return null;
  return propertyPreviewRepo.findByProperty(propertyId);
}

export async function revokePropertyPreviewAction(
  propertyId: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  await propertyPreviewRepo.removeByProperty(propertyId);
  return { ok: true };
}
