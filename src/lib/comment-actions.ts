"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { commentRepo } from "./comments";

export type PostCommentState =
  | {
      ok: true;
      comment: {
        id: string;
        userId: string;
        userName: string;
        body: string;
        createdAt: string;
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

  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const revalidate = String(formData.get("revalidate") ?? "").trim();
  if (!propertyId) return { ok: false, error: "対象の物件が見つかりませんでした。" };
  if (!body) return { ok: false, error: "コメントを入力してください。" };
  if (body.length > 1000) {
    return { ok: false, error: "コメントは1000文字以内で入力してください。" };
  }

  const validated = await commentRepo.upsert({
    id: randomUUID(),
    propertyId,
    userId: user.id,
    userName: user.name || "匿名ユーザー",
    body,
    createdAt: new Date().toISOString(),
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
