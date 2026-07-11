"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./dal";
import { publicDisplayName } from "./account-schema";
import { reviewRepo } from "./reviews";
import { validateReviewBody, validateRating } from "./review-guard";
import { viewUnlockRepo } from "./view-unlocks";

export type PostReviewState =
  | {
      ok: true;
      review: {
        id: string;
        userId: string;
        userName: string;
        rating: number;
        body: string;
        createdAt: string;
        updatedAt: string;
      };
    }
  | { ok: false; error: string }
  | undefined;

/**
 * このユーザーが対象物件の3DGSを視聴済み（有効期限内のアンロックが1件以上ある）か。
 * postOrUpdateReviewAction の投稿権限判定に使う。
 */
async function hasWatchedProperty(userId: string, propertyId: string): Promise<boolean> {
  const unlocks = await viewUnlockRepo.list({ userId, propertyId });
  const now = new Date().toISOString();
  return unlocks.some((u) => u.expiresAt > now);
}

/**
 * レビュー投稿・更新。サインイン必須、かつ対象物件の3DGSを視聴（アンロック）済み
 * であることが条件。既存レビュー（1ユーザー1物件につき1件）があれば更新、
 * 無ければ新規作成する。
 */
export async function postOrUpdateReviewAction(
  propertyId: string,
  rating: number,
  body: string,
): Promise<PostReviewState> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "投稿にはサインインが必要です。" };
  }
  if (user.status === "suspended" && user.role !== "admin") {
    return { ok: false, error: "アカウントが停止されているため投稿できません。" };
  }

  const trimmedPropertyId = String(propertyId ?? "").trim();
  if (!trimmedPropertyId) return { ok: false, error: "対象の物件が見つかりませんでした。" };

  // admin は視聴判定を免除（運営が動作確認できるように）。それ以外は視聴済み必須。
  if (user.role !== "admin") {
    const watched = await hasWatchedProperty(user.id, trimmedPropertyId);
    if (!watched) {
      return { ok: false, error: "3DGSを視聴すると評価を投稿できます" };
    }
  }

  const ratingCheck = validateRating(rating);
  if (!ratingCheck.ok) return { ok: false, error: ratingCheck.error };

  const guard = validateReviewBody(String(body ?? ""));
  if (!guard.ok) return { ok: false, error: guard.error };

  const existing = await reviewRepo.getByUser(trimmedPropertyId, user.id);

  // レート制限は「新規投稿」のみ対象（1物件1件の編集は連投スパムになり得ない
  // ので対象外）。多数の異なる物件へ短時間に大量投稿するパターンを防ぐ。
  if (!existing && user.role !== "admin") {
    const nowDate = new Date();
    const oneMinuteAgo = new Date(nowDate.getTime() - 60_000).toISOString();
    const oneDayAgo = new Date(nowDate.getTime() - 24 * 60 * 60_000).toISOString();

    const recentMinute = await reviewRepo.countRecentByUser(user.id, oneMinuteAgo);
    if (recentMinute >= 3) {
      return { ok: false, error: "投稿間隔が短すぎます。少し待ってから投稿してください。" };
    }
    const recentDay = await reviewRepo.countRecentByUser(user.id, oneDayAgo);
    if (recentDay >= 50) {
      return { ok: false, error: "本日の投稿上限に達しました。" };
    }
  }

  const now = new Date().toISOString();

  const validated = await reviewRepo.upsert({
    id: existing?.id ?? randomUUID(),
    propertyId: trimmedPropertyId,
    userId: user.id,
    userName: publicDisplayName(user) || "匿名ユーザー",
    rating: ratingCheck.rating,
    body: guard.cleaned,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    reports: existing?.reports ?? [],
    hiddenByReports: existing?.hiddenByReports ?? false,
  });

  revalidatePath(`/properties/${trimmedPropertyId}`);
  revalidatePath("/properties");
  return {
    ok: true,
    review: {
      id: validated.id,
      userId: validated.userId,
      userName: validated.userName,
      rating: validated.rating,
      body: validated.body,
      createdAt: validated.createdAt,
      updatedAt: validated.updatedAt,
    },
  };
}

/**
 * レビュー削除。投稿者本人 または admin のみ許可（IDOR対策で必ずサーバー側で判定）。
 */
export async function deleteReviewAction(
  reviewId: string,
  revalidate: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const review = await reviewRepo.get(reviewId);
  if (!review) return { ok: true }; // 既に無い場合は成功扱い

  if (review.userId !== user.id && user.role !== "admin") {
    return { ok: false };
  }

  await reviewRepo.remove(reviewId);
  if (revalidate) revalidatePath(revalidate);
  revalidatePath("/properties");
  return { ok: true };
}

/**
 * レビュー通報。サインイン必須、自分のレビューは通報不可。1ユーザー1回まで
 * （既に通報済みなら冪等に ok:true を返し二重加算しない）。3件で自動非表示。
 */
export async function reportReviewAction(
  reviewId: string,
  revalidate: string,
): Promise<{ ok: boolean; hidden?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "通報にはサインインが必要です。" };

  const review = await reviewRepo.get(reviewId);
  if (!review) return { ok: false, error: "レビューが見つかりませんでした。" };

  if (review.userId === user.id) {
    return { ok: false, error: "自分のレビューは通報できません。" };
  }

  if (review.reports.some((r) => r.userId === user.id)) {
    return { ok: true, hidden: review.hiddenByReports };
  }

  const reports = [...review.reports, { userId: user.id, at: new Date().toISOString() }];
  const hiddenByReports = reports.length >= 3 ? true : review.hiddenByReports;

  await reviewRepo.upsert({ ...review, reports, hiddenByReports });
  if (revalidate) revalidatePath(revalidate);
  return { ok: true, hidden: hiddenByReports };
}

/**
 * 通報による自動非表示を解除。admin専用。
 */
export async function unhideReviewAction(
  reviewId: string,
  revalidate: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return { ok: false };

  const review = await reviewRepo.get(reviewId);
  if (!review) return { ok: true };

  await reviewRepo.upsert({ ...review, reports: [], hiddenByReports: false });
  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
