"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { postCommentAction, deleteCommentAction } from "@/lib/comment-actions";

export interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

const AVATAR_COLORS = ["#4a6d8c", "#1ea0c4", "#8c6d4a", "#5e8c4a", "#8c4a6d", "#6d4a8c"];
function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * 物件ごとの会員限定掲示板。サインイン済みユーザーのみ閲覧・投稿できる
 * （未サインインはサインイン導線のみ表示、コメント本文は出さない）。
 */
export default function PropertyComments({
  propertyId,
  comments: initialComments,
  currentUserId,
  currentUserName,
  isAdmin,
  signedIn,
  locale = "ja",
}: {
  propertyId: string;
  comments: CommentItem[];
  currentUserId: string | null;
  currentUserName?: string | null;
  isAdmin: boolean;
  signedIn: boolean;
  locale?: "ja" | "en";
}) {
  const en = locale === "en";
  const [comments, setComments] = useState(initialComments);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const revalidate = `/properties/${propertyId}`;

  if (!signedIn) {
    return (
      <div className="border border-dashed border-line py-10 px-6 text-center bg-white">
        <p className="text-[13px] text-ink/60 mb-4">
          {en
            ? "Sign in to view and post in this location's board."
            : "サインインすると、この物件の掲示板を閲覧・投稿できます。"}
        </p>
        <Link
          href={`/sign-in?redirect_url=${encodeURIComponent(revalidate)}`}
          className="inline-block mono text-[11px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
        >
          {en ? "Sign in →" : "サインイン →"}
        </Link>
      </div>
    );
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    const optimistic: CommentItem = {
      id: `__pending_${Date.now()}`,
      userId: currentUserId ?? "",
      userName: currentUserName || (en ? "You" : "自分"),
      body,
      createdAt: new Date().toISOString(),
    };
    setComments((c) => [...c, optimistic]);
    formRef.current?.reset();
    startTransition(async () => {
      const res = await postCommentAction(undefined, formData);
      if (res?.ok) {
        setComments((c) => c.map((x) => (x.id === optimistic.id ? res.comment : x)));
      } else {
        setComments((c) => c.filter((x) => x.id !== optimistic.id));
        setError(res?.error ?? (en ? "Failed to post." : "投稿に失敗しました。"));
      }
    });
  };

  const onDelete = (id: string) => {
    setRemovingId(id);
    startTransition(async () => {
      const res = await deleteCommentAction(id, revalidate);
      if (res.ok) {
        setComments((c) => c.filter((x) => x.id !== id));
      }
      setRemovingId(null);
    });
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(en ? "en-US" : "ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {comments.length === 0 ? (
        <p className="text-[13px] text-ink/40 py-6 text-center">
          {en ? "No comments yet. Be the first to post." : "まだコメントはありません。最初の投稿をどうぞ。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3 mb-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="relative border border-line bg-white px-4 py-3.5 transition hover:border-ink/30"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
                  style={{ backgroundColor: avatarColor(c.userId) }}
                >
                  {c.userName.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold">
                    {c.userName}
                    {c.userId === currentUserId && (
                      <span className="text-[9px] font-bold text-accent border border-accent rounded-[3px] px-1 ml-1 align-middle">
                        {en ? "You" : "自分"}
                      </span>
                    )}
                  </div>
                  <span className="mono text-[10px] text-muted">{fmt(c.createdAt)}</span>
                </div>
              </div>
              <p className="text-[13.5px] leading-[1.85] text-ink/90 whitespace-pre-line">
                {c.body}
              </p>
              {(c.userId === currentUserId || isAdmin) && !c.id.startsWith("__pending_") && (
                <button
                  type="button"
                  onClick={() => onDelete(c.id)}
                  disabled={removingId === c.id}
                  title={en ? "Delete" : "削除"}
                  aria-label={en ? "Delete comment" : "コメントを削除"}
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
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="flex gap-3 items-start border border-dashed border-line bg-bg px-4 py-3.5">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="revalidate" value={revalidate} />
        <div
          className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-bold shrink-0"
          style={{ backgroundColor: avatarColor(currentUserId ?? "") }}
        >
          {(currentUserName || (en ? "You" : "自分")).trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            name="body"
            required
            maxLength={1000}
            rows={2}
            placeholder={en ? "Write a comment…" : "コメントを入力…"}
            className="w-full border-none bg-transparent text-[13.5px] leading-[1.8] resize-y min-h-[44px] focus:outline-none p-0"
          />
          {error && <p className="text-[12px] text-red-400 mt-1">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-40 shrink-0"
        >
          {en ? "Post" : "投稿"}
        </button>
      </form>
    </div>
  );
}
