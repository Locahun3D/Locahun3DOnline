"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  postOrUpdateReviewAction,
  deleteReviewAction,
  reportReviewAction,
  unhideReviewAction,
} from "@/lib/review-actions";

export interface ReviewItem {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  reports?: { userId: string; at: string }[];
  hiddenByReports?: boolean;
}

/** デフォルトで表示するレビュー件数（超過分は「すべて表示」で展開）。 */
const PAGE_SIZE = 4;

const AVATAR_COLORS = ["#4a6d8c", "#1ea0c4", "#8c6d4a", "#5e8c4a", "#8c4a6d", "#6d4a8c"];
function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** 星アイコン（インラインSVG）。塗り or 輪郭のみ。 */
function StarIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return filled ? (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.95 6.32 6.8.72-5.05 4.75 1.4 6.86L12 17.6l-6.1 3.55 1.4-6.86L2.25 9.54l6.8-.72L12 2.5z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.5l2.95 6.32 6.8.72-5.05 4.75 1.4 6.86L12 17.6l-6.1 3.55 1.4-6.86L2.25 9.54l6.8-.72L12 2.5z" />
    </svg>
  );
}

/** 星5つの静的表示（平均★や各レビューカードの評価表示に使用）。 */
function StarRow({
  value,
  size = 16,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 text-accent ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= Math.round(value)} size={size} />
      ))}
    </div>
  );
}

/** 星クリック選択UI（投稿フォーム用、hover プレビュー付き）。 */
function StarPicker({
  value,
  onChange,
  size = 26,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} star`}
          className="text-accent hover:scale-110 transition-transform"
        >
          <StarIcon filled={n <= (hover || value)} size={size} />
        </button>
      ))}
    </div>
  );
}

/**
 * 物件ごとのレビュー・評価。投稿できるのは有料プラン（Individual / Studio / Team）
 * の会員のみ（Free会員は案内のみ、未サインインはサインイン導線のみ表示）。閲覧は全員可。
 */
export default function PropertyReviews({
  propertyId,
  reviews: initialReviews,
  stats,
  currentUserId,
  currentUserName,
  isAdmin,
  signedIn,
  canReview = false,
  locale = "ja",
}: {
  propertyId: string;
  reviews: ReviewItem[];
  /**
   * 平均★と件数（カタログと同じ集計値、未サインインでも公開）。
   * 未サインインは reviews が空配列で渡ってくるため、無ければローカルの
   * reviews から計算した値にフォールバックする。
   */
  stats?: { average: number; count: number };
  currentUserId: string | null;
  currentUserName?: string | null;
  isAdmin: boolean;
  signedIn: boolean;
  /** 投稿権限（有料プラン or admin）。Free会員は false。 */
  canReview?: boolean;
  locale?: "ja" | "en";
}) {
  const en = locale === "en";
  const [reviews, setReviews] = useState(initialReviews);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const myReview = currentUserId ? reviews.find((r) => r.userId === currentUserId) ?? null : null;
  const [editing, setEditing] = useState(false);
  const [formRating, setFormRating] = useState<number>(myReview?.rating ?? 0);
  const [formBody, setFormBody] = useState<string>(myReview?.body ?? "");

  const revalidate = `/properties/${propertyId}`;

  const visible = reviews.filter((r) => !r.hiddenByReports || isAdmin);
  const localStats = (() => {
    const v = reviews.filter((r) => !r.hiddenByReports);
    if (v.length === 0) return { average: 0, count: 0 };
    const sum = v.reduce((acc, r) => acc + r.rating, 0);
    return { average: Math.round((sum / v.length) * 10) / 10, count: v.length };
  })();
  // reviews が実際に読み込まれていれば（サインイン後 or 投稿/編集直後）その場の
  // 集計を優先し、未サインインで reviews=[] の間だけ公開用の stats を使う。
  const { average, count } = reviews.length > 0 ? localStats : (stats ?? localStats);

  const startEdit = () => {
    setFormRating(myReview?.rating ?? 0);
    setFormBody(myReview?.body ?? "");
    setEditing(true);
    setError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (formRating < 1 || formRating > 5) {
      setError(en ? "Please select a star rating." : "星の数を選択してください。");
      return;
    }
    startTransition(async () => {
      const res = await postOrUpdateReviewAction(propertyId, formRating, formBody);
      if (res?.ok) {
        setReviews((prev) => {
          const next = prev.filter((r) => r.id !== res.review.id);
          return [{ ...res.review, reports: myReview?.reports ?? [], hiddenByReports: myReview?.hiddenByReports ?? false }, ...next];
        });
        setEditing(false);
      } else {
        setError(res?.error ?? (en ? "Failed to post." : "投稿に失敗しました。"));
      }
    });
  };

  const onDelete = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      const res = await deleteReviewAction(id, revalidate);
      if (res.ok) {
        setReviews((r) => r.filter((x) => x.id !== id));
        setEditing(false);
      }
      setRemovingId(null);
    });
  };

  const onReport = (id: string) => {
    if (!confirm(en ? "Report this review to the operator?" : "このレビューを運営に通報しますか？")) return;
    startTransition(async () => {
      const res = await reportReviewAction(id, revalidate);
      if (res.ok) {
        setReportedIds((s) => new Set(s).add(id));
        if (res.hidden && !isAdmin) {
          setReviews((r) => r.filter((x) => x.id !== id));
        } else if (res.hidden) {
          setReviews((r) => r.map((x) => (x.id === id ? { ...x, hiddenByReports: true } : x)));
        }
      }
    });
  };

  const onUnhide = (id: string) => {
    startTransition(async () => {
      const res = await unhideReviewAction(id, revalidate);
      if (res.ok) {
        setReviews((r) => r.map((x) => (x.id === id ? { ...x, hiddenByReports: false, reports: [] } : x)));
      }
    });
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(en ? "en-US" : "ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const others = visible.filter((r) => r.userId !== currentUserId);
  const orderedOthers = [...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visibleOthers = showAll ? orderedOthers : orderedOthers.slice(0, PAGE_SIZE);

  const renderCard = (r: ReviewItem) => {
    const isMine = r.userId === currentUserId;
    const isHidden = !!r.hiddenByReports;
    const alreadyReported = reportedIds.has(r.id) || (r.reports ?? []).some((rep) => rep.userId === currentUserId);
    if (isHidden && !isAdmin) return null;

    return (
      <div
        key={r.id}
        className={`relative border bg-white transition hover:border-ink/30 px-4 py-3.5 ${
          isHidden ? "border-amber-300 bg-amber-50/40" : "border-line"
        }`}
      >
        {isHidden && (
          <div className="mb-2 inline-flex items-center gap-2 mono text-[10px] text-amber-700 bg-amber-100 border border-amber-300 px-2 py-1">
            <span>{en ? "⚠ Hidden (reported)" : "⚠ 通報により非表示"}</span>
            <button
              type="button"
              onClick={() => onUnhide(r.id)}
              disabled={pending}
              className="underline hover:no-underline disabled:opacity-40"
            >
              {en ? "Unhide" : "表示に戻す"}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2.5 mb-2">
          <div
            className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor(r.userId) }}
          >
            {r.userName.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold flex items-center gap-1.5">
              {r.userName}
              {isMine && (
                <span className="text-[9px] font-bold text-accent border border-accent rounded-[3px] px-1 align-middle">
                  {en ? "You" : "自分"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRow value={r.rating} size={12} />
              <span className="mono text-[10px] text-muted">{fmt(r.updatedAt || r.createdAt)}</span>
            </div>
          </div>
        </div>
        {r.body && (
          <p className="text-[13.5px] leading-[1.85] text-ink/90 whitespace-pre-line">{r.body}</p>
        )}

        <div className="flex items-center gap-3 mt-2">
          {!isMine && (
            <button
              type="button"
              onClick={() => onReport(r.id)}
              disabled={alreadyReported || pending}
              className="flex items-center gap-1 mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-amber-600 transition disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 3v18M5 4h11l-2.5 4L16 12H5" />
              </svg>
              {alreadyReported ? (en ? "Reported" : "通報済み") : en ? "Report" : "通報"}
            </button>
          )}
        </div>

        {(isMine || isAdmin) && (
          <button
            type="button"
            onClick={() => onDelete(r.id)}
            disabled={removingId === r.id}
            title={en ? "Delete" : "削除"}
            aria-label={en ? "Delete review" : "レビューを削除"}
            className="absolute top-2.5 right-2.5 grid place-items-center w-7 h-7 border border-line bg-white text-muted hover:text-red-500 hover:border-red-400 transition disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* ── ヘッダ: 平均★＋件数 ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span className="text-[32px] font-bold leading-none">{count > 0 ? average.toFixed(1) : "—"}</span>
        <StarRow value={average} size={20} />
        <span className="text-[13px] text-muted">
          {en
            ? `(${count} review${count === 1 ? "" : "s"})`
            : `（${count}件のレビュー）`}
        </span>
      </div>

      {!signedIn && (
        <div className="border border-dashed border-line py-8 px-6 text-center bg-white mb-6">
          <p className="text-[13px] text-ink/60 mb-4">
            {en
              ? "Sign in to view and post reviews for this location."
              : "サインインすると、この物件のレビューを閲覧・投稿できます。"}
          </p>
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(revalidate)}`}
            className="inline-block mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "Sign in →" : "サインイン →"}
          </Link>
        </div>
      )}

      {signedIn && (
        <>
          {/* ── 自分のレビュー（既存があれば先頭カード） ── */}
          {myReview && !editing && (
            <div className="mb-4">{renderCard(myReview)}
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={startEdit}
                  className="mono text-[10px] tracking-[0.15em] uppercase text-accent hover:underline"
                >
                  {en ? "Edit my review" : "自分のレビューを編集"}
                </button>
              </div>
            </div>
          )}

          {/* ── 投稿/編集フォーム ── */}
          {canReview && (myReview === null || editing) && (
            <form
              onSubmit={onSubmit}
              className="mb-6 border border-dashed border-line bg-bg px-5 py-5"
            >
              <div className="mono text-[10px] tracking-[0.2em] uppercase text-muted mb-2">
                {myReview ? (en ? "Edit your review" : "レビューを編集") : en ? "Write a review" : "レビューを投稿"}
              </div>
              <StarPicker value={formRating} onChange={setFormRating} />
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={en ? "Comment (optional)…" : "コメント（任意）…"}
                className="w-full border border-line bg-white text-[13.5px] leading-[1.8] resize-y min-h-[70px] focus:outline-none focus:border-accent transition p-3 mt-3"
              />
              {error && <p className="text-[12px] text-red-400 mt-2">{error}</p>}
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="submit"
                  disabled={pending}
                  className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-40"
                >
                  {en ? "Post" : "投稿"}
                </button>
                {myReview && editing && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="mono text-[10px] tracking-[0.15em] uppercase border border-line text-muted px-4 py-2 hover:border-ink/30 transition"
                  >
                    {en ? "Cancel" : "キャンセル"}
                  </button>
                )}
              </div>
            </form>
          )}

          {!canReview && !myReview && (
            <div className="border border-dashed border-line bg-bg px-5 py-5 text-center mb-6">
              <p className="text-[12.5px] text-ink/60">
                {en
                  ? "Reviews can be posted on a paid plan (Individual / Studio / Team)."
                  : "レビューの投稿は有料プラン（Individual / Studio / Team）でご利用いただけます。"}
              </p>
              <Link
                href="/pricing"
                className="inline-block mt-3 mono text-[10px] tracking-[0.2em] uppercase text-accent hover:underline"
              >
                {en ? "See plans →" : "プランを見る →"}
              </Link>
            </div>
          )}
        </>
      )}

      {/* ── レビュー一覧（自分以外） ── */}
      {signedIn && (
        <>
          {orderedOthers.length === 0 ? (
            <p className="text-[13px] text-ink/40 py-6 text-center">
              {en ? "No other reviews yet." : "まだ他のレビューはありません。"}
            </p>
          ) : (
            <div className="flex flex-col gap-3 mb-4">
              {visibleOthers.map((r) => renderCard(r))}
            </div>
          )}

          {orderedOthers.length > PAGE_SIZE && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mono text-[10px] tracking-[0.18em] uppercase border border-line text-muted px-4 py-2 hover:border-ink/40 hover:text-ink transition"
              >
                {showAll
                  ? en
                    ? "Collapse"
                    : "折りたたむ"
                  : en
                    ? `Show all reviews (${orderedOthers.length})`
                    : `すべてのレビューを表示（全${orderedOthers.length}件）`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
