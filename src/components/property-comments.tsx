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

/**
 * 物件ごとの会員限定掲示板。サインイン済みユーザーのみ閲覧・投稿できる
 * （未サインインはサインイン導線のみ表示、コメント本文は出さない）。
 */
export default function PropertyComments({
  propertyId,
  comments: initialComments,
  currentUserId,
  isAdmin,
  signedIn,
  locale = "ja",
}: {
  propertyId: string;
  comments: CommentItem[];
  currentUserId: string | null;
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
      userName: en ? "You" : "自分",
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
        <ul className="space-y-4 mb-6">
          {comments.map((c) => (
            <li key={c.id} className="border-b border-line pb-4 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-bold">{c.userName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="mono text-[10px] text-muted">{fmt(c.createdAt)}</span>
                  {(c.userId === currentUserId || isAdmin) && !c.id.startsWith("__pending_") && (
                    <button
                      type="button"
                      onClick={() => onDelete(c.id)}
                      disabled={removingId === c.id}
                      className="mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-red-400 transition disabled:opacity-40"
                    >
                      {en ? "Delete" : "削除"}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[14px] leading-[1.8] text-ink/90 whitespace-pre-line mt-1">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="revalidate" value={revalidate} />
        <textarea
          name="body"
          required
          maxLength={1000}
          rows={3}
          placeholder={en ? "Write a comment…" : "コメントを入力…"}
          className="w-full border border-line bg-bg px-3 py-2.5 text-[14px] resize-y focus:outline-none focus:border-accent"
        />
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mono text-[11px] tracking-[0.18em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition disabled:opacity-40"
        >
          {en ? "Post" : "投稿する"}
        </button>
      </form>
    </div>
  );
}
