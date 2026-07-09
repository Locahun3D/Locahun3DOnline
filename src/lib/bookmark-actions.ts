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

/**
 * 物件のタグ一覧を丸ごと置き換える（フォルダと違い1物件に複数付けられる、
 * 案件をまたぐ横断ラベル）。空配列ならエントリごと削除。
 */
export async function setBookmarkTagsAction(
  propertyId: string,
  tags: string[],
): Promise<{ ok: boolean; tags: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, tags: [] };
  if (!propertyId) return { ok: false, tags: [] };

  const cleaned = [
    ...new Set(
      tags
        .map((t) => t.trim().slice(0, 30))
        .filter(Boolean),
    ),
  ].slice(0, 10);

  const u = await userRepo.get(user.id);
  if (!u) return { ok: false, tags: [] };

  const bookmarkTags = { ...(u.bookmarkTags ?? {}) };
  if (cleaned.length > 0) {
    bookmarkTags[propertyId] = cleaned;
  } else {
    delete bookmarkTags[propertyId];
  }
  await userRepo.upsert({ ...u, bookmarkTags });

  revalidatePath(BOOKMARKS_PATH);
  return { ok: true, tags: cleaned };
}

/**
 * Pinterest 風の保存ポップオーバー用: この物件の保存状態と、ユーザーの
 * フォルダ一覧をまとめて返す（ポップオーバーを開いた時に遅延取得する）。
 */
export async function getBookmarkContextAction(propertyId: string): Promise<{
  signedIn: boolean;
  bookmarked: boolean;
  folderId: string | null;
  folders: { id: string; name: string }[];
}> {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false, bookmarked: false, folderId: null, folders: [] };
  const u = await userRepo.get(user.id);
  if (!u) return { signedIn: true, bookmarked: false, folderId: null, folders: [] };
  return {
    signedIn: true,
    bookmarked: (u.bookmarks ?? []).includes(propertyId),
    folderId: (u.bookmarkFolderAssignments ?? {})[propertyId] ?? null,
    folders: u.bookmarkFolders ?? [],
  };
}

/**
 * Pinterest 風の保存: 物件をブックマーク（未保存なら追加）しつつ、指定フォルダへ
 * 割り当てる（folderId=null で未整理）。新規フォルダ名を渡した場合は先に作成する。
 * ブックマーク追加とフォルダ割り当てを1アクションにまとめ、ポップオーバーから
 * 1クリックで「このボードに保存」を実現する。
 */
export async function saveBookmarkToFolderAction(
  propertyId: string,
  folderId: string | null,
  opts?: { newFolderName?: string; revalidate?: string },
): Promise<{ ok: boolean; folderId: string | null; folder?: { id: string; name: string } }> {
  const user = await getCurrentUser();
  if (!user || !propertyId) return { ok: false, folderId: null };
  const u = await userRepo.get(user.id);
  if (!u) return { ok: false, folderId: null };

  let createdFolder: { id: string; name: string } | undefined;
  let folders = u.bookmarkFolders ?? [];
  let targetFolder = folderId;

  const newName = opts?.newFolderName?.trim().slice(0, 60);
  if (newName) {
    createdFolder = { id: nanoid(10), name: newName };
    folders = [...folders, createdFolder];
    targetFolder = createdFolder.id;
  }

  const bookmarks = new Set(u.bookmarks ?? []);
  bookmarks.add(propertyId);

  const assignments = { ...(u.bookmarkFolderAssignments ?? {}) };
  if (targetFolder) assignments[propertyId] = targetFolder;
  else delete assignments[propertyId];

  await userRepo.upsert({
    ...u,
    bookmarks: [...bookmarks],
    bookmarkFolders: folders,
    bookmarkFolderAssignments: assignments,
  });

  revalidatePath(BOOKMARKS_PATH);
  revalidatePath("/account");
  if (opts?.revalidate) revalidatePath(opts.revalidate);
  return { ok: true, folderId: targetFolder ?? null, folder: createdFolder };
}
