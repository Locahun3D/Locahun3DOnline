"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { repo } from "@/lib/store";
import { userRepo } from "@/lib/users";

/**
 * サーバーアクション用の admin チェック。
 * ⚠ requireAdmin()（= requireRole → redirect("/")）をここで使ってはいけない。
 * アクション内の redirect は 303 になり**呼び出し元ページごとホームへ飛ぶ**。
 * マウント時に自動で呼ぶ読み取り系アクションだと、studio がエディタを開いた
 * 瞬間に追い出される（preview-actions.ts で実際に起きた事故と同じパターン）。
 * 読み取りは null を返し、変更系は throw でエラーとして返す。
 */
async function currentAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return u?.role === "admin";
}

async function assertAdmin(): Promise<void> {
  if (!(await currentAdmin())) throw new Error("forbidden");
}

/**
 * 当社がスキャンして掲載した物件を、後からスタジオのアカウントへ引き渡す運用向け。
 * assertPropertyAccess（src/lib/dal.ts）は ownerId===user.id || linkedPropertyIds
 * を見て編集権限を判定しており、データ構造自体は前からあったが設定 UI が無く、
 * DB（data/users.json / D1）を直接編集するしかなかった。ここでその設定 UI を
 * 支えるサーバーアクション群を提供する。
 */

/** パネル表示用に絞ったユーザー情報。トークン残高等の無関係な項目は渡さない。 */
export interface OwnerUserInfo {
  id: string;
  email: string;
  role: string;
}

function toOwnerInfo(u: { id: string; email: string; role: string }): OwnerUserInfo {
  return { id: u.id, email: u.email, role: u.role };
}

export interface PropertyOwnershipInfo {
  ownerId: string;
  owner: OwnerUserInfo | null;
  linkedUsers: OwnerUserInfo[];
}

/** 物件の現在の所有者(ownerId)と、紐付け済みアカウント(linkedPropertyIds)を返す。 */
export async function getPropertyOwnershipAction(
  propertyId: string,
): Promise<PropertyOwnershipInfo | null> {
  if (!(await currentAdmin())) return null;
  const prop = await repo.get(propertyId);
  const ownerId = prop?.ownerId || "";
  const owner = ownerId ? await userRepo.get(ownerId) : null;
  const users = await userRepo.list();
  const linkedUsers = users
    .filter((u) => (u.linkedPropertyIds ?? []).includes(propertyId))
    .map(toOwnerInfo);
  return { ownerId, owner: owner ? toOwnerInfo(owner) : null, linkedUsers };
}

/** メールアドレス完全一致でユーザーを検索する（曖昧検索は不要という要件のため）。 */
export async function findUserByEmailAction(
  email: string,
): Promise<OwnerUserInfo | null> {
  if (!(await currentAdmin())) return null;
  const u = await userRepo.getByEmail(email.trim());
  return u ? toOwnerInfo(u) : null;
}

/** 物件の所有者(ownerId)を設定する。既存の所有者があれば上書きする。 */
export async function setPropertyOwnerAction(
  propertyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const prop = await repo.get(propertyId);
  if (!prop) return { ok: false, error: "物件が見つかりません" };
  const user = await userRepo.get(userId);
  if (!user) return { ok: false, error: "ユーザーが見つかりません" };
  await repo.upsert({ ...prop, ownerId: user.id });
  revalidatePath(`/admin/properties/${propertyId}/edit`);
  revalidatePath("/admin/properties");
  return { ok: true };
}

/** 所有者をクリアする（ownerId を空文字に戻す）。紐付け(linkedPropertyIds)は影響しない。 */
export async function clearPropertyOwnerAction(
  propertyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const prop = await repo.get(propertyId);
  if (!prop) return { ok: false, error: "物件が見つかりません" };
  await repo.upsert({ ...prop, ownerId: "" });
  revalidatePath(`/admin/properties/${propertyId}/edit`);
  revalidatePath("/admin/properties");
  return { ok: true };
}

/** 指定ユーザーの linkedPropertyIds にこの物件IDを追加する（重複追加はしない）。 */
export async function addPropertyLinkAction(
  propertyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const prop = await repo.get(propertyId);
  if (!prop) return { ok: false, error: "物件が見つかりません" };
  const user = await userRepo.get(userId);
  if (!user) return { ok: false, error: "ユーザーが見つかりません" };
  const linked = user.linkedPropertyIds ?? [];
  if (!linked.includes(propertyId)) {
    await userRepo.upsert({ ...user, linkedPropertyIds: [...linked, propertyId] });
  }
  revalidatePath(`/admin/properties/${propertyId}/edit`);
  revalidatePath("/admin/properties");
  return { ok: true };
}

/** 指定ユーザーの linkedPropertyIds からこの物件IDを除去する。 */
export async function removePropertyLinkAction(
  propertyId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin();
  const user = await userRepo.get(userId);
  if (!user) return { ok: false, error: "ユーザーが見つかりません" };
  const linked = user.linkedPropertyIds ?? [];
  if (linked.includes(propertyId)) {
    await userRepo.upsert({
      ...user,
      linkedPropertyIds: linked.filter((id) => id !== propertyId),
    });
  }
  revalidatePath(`/admin/properties/${propertyId}/edit`);
  revalidatePath("/admin/properties");
  return { ok: true };
}
