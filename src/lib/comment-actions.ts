"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { publicDisplayName, canPostToBoard } from "./account-schema";
import { commentRepo } from "./comments";
import { validateCommentBody } from "./comment-guard";

export type PostCommentState =
  | {
      ok: true;
      comment: {
        id: string;
        userId: string;
        userName: string;
        body: string;
        createdAt: string;
        parentId: string;
      };
    }
  | { ok: false; error: string }
  | undefined;

/**
 * 物件掲示板への投稿。会員限定（サインイン必須）。
 * revalidate には呼び出し元の物件詳細ページのパスを渡す。
 */
export async function postCommentAction(
  _prev: PostCommentState,
  formData: FormData,
): Promise<PostCommentState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "投稿にはサインインが必要です。" };
  }
  // getCurrentUser は停止中アカウントに既に null を返すが、将来的な変更に
  // 備えてここでも明示的に弾く（admin は免除、pending=承認待ちはブロックしない）。
  if (user.status === "suspended" && user.role !== "admin") {
    return { ok: false, error: "アカウントが停止されているため投稿できません。" };
  }
  // 書き込みは有料プラン限定（Individual / Studio / Team、閲覧・いいねは会員全員）。
  // UI 側でも入力欄を出し分けるが、権限判定は必ずサーバー側を正とする。
  if (!canPostToBoard(user)) {
    return {
      ok: false,
      error: "掲示板への書き込みは有料プラン（Individual / Studio / Team）でご利用いただけます。",
    };
  }

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const rawBody = String(formData.get("body") ?? "").trim();
  const revalidate = String(formData.get("revalidate") ?? "").trim();
  const parentIdInput = String(formData.get("parentId") ?? "").trim();
  if (!propertyId) return { ok: false, error: "対象の物件が見つかりませんでした。" };

  let parentId = "";
  if (parentIdInput) {
    const parent = await commentRepo.get(parentIdInput);
    if (!parent || parent.propertyId !== propertyId) {
      return { ok: false, error: "返信先のコメントが見つかりませんでした。" };
    }
    parentId = parentIdInput;
  }

  const guard = validateCommentBody(rawBody);
  if (!guard.ok) return { ok: false, error: guard.error };
  const body = guard.cleaned;

  if (user.role !== "admin") {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60_000).toISOString();

    const recentMinute = await commentRepo.countRecentByUser(user.id, oneMinuteAgo);
    if (recentMinute >= 3) {
      return { ok: false, error: "投稿間隔が短すぎます。少し待ってから投稿してください。" };
    }
    const recentDay = await commentRepo.countRecentByUser(user.id, oneDayAgo);
    if (recentDay >= 50) {
      return { ok: false, error: "本日の投稿上限に達しました。" };
    }
    const isDuplicate = await commentRepo.findRecentDuplicate(user.id, body, tenMinutesAgo);
    if (isDuplicate) {
      return { ok: false, error: "同じ内容の投稿が連続しています。" };
    }
  }

  const validated = await commentRepo.upsert({
    id: randomUUID(),
    propertyId,
    userId: user.id,
    userName: publicDisplayName(user) || "匿名ユーザー",
    body,
    createdAt: new Date().toISOString(),
    parentId,
    reports: [],
    hiddenByReports: false,
    likedBy: [],
  });

  if (revalidate) revalidatePath(revalidate);
  return {
    ok: true,
    comment: {
      id: validated.id,
      userId: validated.userId,
      userName: validated.userName,
      body: validated.body,
      createdAt: validated.createdAt,
      parentId: validated.parentId,
    },
  };
}

/**
 * コメント削除。投稿者本人 または admin のみ許可（IDOR対策で必ずサーバー側で判定）。
 */
export async function deleteCommentAction(
  commentId: string,
  revalidate: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const comment = await commentRepo.get(commentId);
  if (!comment) return { ok: true }; // 既に無い場合は成功扱い

  if (comment.userId !== user.id && user.role !== "admin") {
    return { ok: false };
  }

  await commentRepo.remove(commentId);
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}

/**
 * コメント通報。サインイン必須、自分のコメントは通報不可。1ユーザー1回まで
 * （既に通報済みなら冪等に ok:true を返し二重加算しない）。3件で自動非表示。
 */
export async function reportCommentAction(
  commentId: string,
  revalidate: string,
): Promise<{ ok: boolean; hidden?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "通報にはサインインが必要です。" };

  const comment = await commentRepo.get(commentId);
  if (!comment) return { ok: false, error: "コメントが見つかりませんでした。" };

  if (comment.userId === user.id) {
    return { ok: false, error: "自分のコメントは通報できません。" };
  }

  if (comment.reports.some((r) => r.userId === user.id)) {
    return { ok: true, hidden: comment.hiddenByReports };
  }

  const reports = [...comment.reports, { userId: user.id, at: new Date().toISOString() }];
  const hiddenByReports = reports.length >= 3 ? true : comment.hiddenByReports;

  await commentRepo.upsert({ ...comment, reports, hiddenByReports });
  if (revalidate) revalidatePath(revalidate);
  return { ok: true, hidden: hiddenByReports };
}

/**
 * コメントへの いいね トグル。サインイン必須。自分のコメントにもいいね可。
 * likedBy に自分の userId が無ければ追加、あれば削除する（冪等なトグル）。
 * IDOR対策で判定はサーバー側のみ、レスポンスは最新の likedBy を返す。
 */
export async function toggleCommentLikeAction(
  commentId: string,
): Promise<{ ok: boolean; likedBy?: string[]; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "いいねにはサインインが必要です。" };

  const comment = await commentRepo.get(commentId);
  if (!comment) return { ok: false, error: "コメントが見つかりませんでした。" };

  const current = comment.likedBy ?? [];
  const alreadyLiked = current.includes(user.id);
  const likedBy = alreadyLiked
    ? current.filter((id) => id !== user.id)
    : [...current, user.id];

  const updated = await commentRepo.upsert({ ...comment, likedBy });
  return { ok: true, likedBy: updated.likedBy };
}

/**
 * 通報による自動非表示を解除。admin専用。
 */
export async function unhideCommentAction(
  commentId: string,
  revalidate: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false };

  const comment = await commentRepo.get(commentId);
  if (!comment) return { ok: true };

  await commentRepo.upsert({ ...comment, reports: [], hiddenByReports: false });
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
