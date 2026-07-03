"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
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

const BOOKMARKS_PATH = "/dashboard/bookmarks";

/**
 * ブックマーク・フォルダを新規作成する。
 */
export async function createBookmarkFolderAction(
  name: string,
): Promise<{ ok: boolean; folder?: { id: string; name: string } }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return { ok: false };

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false };

  const folder = { id: nanoid(10), name: trimmed };
  const folders = [...(u.bookmarkFolders ?? []), folder];
  await userRepo.upsert({ ...u, bookmarkFolders: folders });

  revalidatePath(BOOKMARKS_PATH);
  return { ok: true, folder };
}

/**
 * ブックマーク・フォルダの名前を変更する。
 */
export async function renameBookmarkFolderAction(
  folderId: string,
  name: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const trimmed = name.trim().slice(0, 60);
  if (!folderId || !trimmed) return { ok: false };

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false };

  const folders = (u.bookmarkFolders ?? []).map((f) =>
    f.id === folderId ? { ...f, name: trimmed } : f,
  );
  await userRepo.upsert({ ...u, bookmarkFolders: folders });

  revalidatePath(BOOKMARKS_PATH);
  return { ok: true };
}

/**
 * ブックマーク・フォルダを削除する。フォルダに割り当てられていた物件は
 * ブックマーク自体はそのまま保ち、「未整理」に戻す（bookmarks は変更しない）。
 */
export async function deleteBookmarkFolderAction(
  folderId: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!folderId) return { ok: false };

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false };

  const folders = (u.bookmarkFolders ?? []).filter((f) => f.id !== folderId);
  const assignments = { ...(u.bookmarkFolderAssignments ?? {}) };
  for (const propertyId of Object.keys(assignments)) {
    if (assignments[propertyId] === folderId) delete assignments[propertyId];
  }
  await userRepo.upsert({
    ...u,
    bookmarkFolders: folders,
    bookmarkFolderAssignments: assignments,
  });

  revalidatePath(BOOKMARKS_PATH);
  return { ok: true };
}

/**
 * 物件をフォルダへ割り当てる／未整理に戻す（folderId が null/空なら解除）。
 */
export async function assignBookmarkFolderAction(
  propertyId: string,
  folderId: string | null,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  if (!propertyId) return { ok: false };

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false };

  const assignments = { ...(u.bookmarkFolderAssignments ?? {}) };
  if (folderId) {
    assignments[propertyId] = folderId;
  } else {
    delete assignments[propertyId];
  }
  await userRepo.upsert({ ...u, bookmarkFolderAssignments: assignments });

  revalidatePath(BOOKMARKS_PATH);
  return { ok: true };
}
