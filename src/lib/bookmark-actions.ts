"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { userRepo } from "./users";

/**
 * 物件ブックマークのトグル。サインイン必須。
 * 戻り値で新しい状態（true=保存済み）を返し、クライアントの楽観更新と整合させる。
 */
export async function toggleBookmarkAction(
  propertyId: string,
  revalidate?: string,
): Promise<{ ok: boolean; bookmarked: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, bookmarked: false };
  if (!propertyId) return { ok: false, bookmarked: false };

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false, bookmarked: false };

  const set = new Set(u.bookmarks ?? []);
  let bookmarked: boolean;
  if (set.has(propertyId)) {
    set.delete(propertyId);
    bookmarked = false;
  } else {
    set.add(propertyId);
    bookmarked = true;
  }
  await userRepo.upsert({ ...u, bookmarks: [...set] });

  revalidatePath("/dashboard/bookmarks");
  revalidatePath("/account");
  if (revalidate) revalidatePath(revalidate);

  return { ok: true, bookmarked };
}
