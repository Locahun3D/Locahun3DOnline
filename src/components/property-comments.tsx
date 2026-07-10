"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  postCommentAction,
  deleteCommentAction,
  reportCommentAction,
  unhideCommentAction,
  toggleCommentLikeAction,
} from "@/lib/comment-actions";

export interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  parentId: string;
  reports?: { userId: string; at: string }[];
  hiddenByReports?: boolean;
  likedBy?: string[];
}

/** デフォルトで表示するルートスレッド数（超過分は「すべて表示」で展開）。 */
const ROOT_PAGE_SIZE = 3;
/** スレッド内でデフォルト表示する返信数（超過分は「他N件を表示」で展開）。 */
const REPLY_PAGE_SIZE = 2;

const AVATAR_COLORS = ["#4a6d8c", "#1ea0c4", "#8c6d4a", "#5e8c4a", "#8c4a6d", "#6d4a8c"];
function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** ルート解決結果: グルーピングキーと、親が欠落しているか（トゥームストーン表示用）。 */
interface ThreadGroup {
  rootKey: string;
  root: CommentItem | null; // null = 親が見つからない(トゥームストーン)
  replies: CommentItem[];
}

/**
 * コメント配列をスレッド1段グルーピングに変換する。
 * - parentId が空 = ルート投稿。
 * - parentId 付きは、parentId チェーンを遡ってルートを解決（サイクルガード付き）。
 * - 途中で存在しない親IDに当たったら、その欠落IDをルートキーとして扱う
 *   （トゥームストーン表示）。
 */
function groupIntoThreads(comments: CommentItem[]): ThreadGroup[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const order: string[] = []; // ルートキーの初出順を保つ
  const groups = new Map<string, ThreadGroup>();

  function resolveRootKey(c: CommentItem): string {
    if (!c.parentId) return c.id;
    const visited = new Set<string>();
    let cur: CommentItem = c;
    while (cur.parentId) {
      if (visited.has(cur.id)) return cur.id; // サイクル検出時はここで打ち切り
      visited.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) return cur.parentId; // 親が存在しない = トゥームストーン
      cur = parent;
    }
    return cur.id;
  }

  for (const c of comments) {
    if (!c.parentId) {
      if (!groups.has(c.id)) {
        groups.set(c.id, { rootKey: c.id, root: c, replies: [] });
        order.push(c.id);
      } else {
        groups.get(c.id)!.root = c;
      }
    }
  }

  for (const c of comments) {
    if (!c.parentId) continue;
    const rootKey = resolveRootKey(c);
    let group = groups.get(rootKey);
    if (!group) {
      group = { rootKey, root: byId.get(rootKey) ?? null, replies: [] };
      groups.set(rootKey, group);
      order.push(rootKey);
    }
    group.replies.push(c);
  }

  for (const group of groups.values()) {
    group.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // 表示順 = ルートのいいね数 降順 → 同数なら新しい順。
  // トゥームストーン（root が null）はいいね 0 扱いで、返信の最新日時をタイブレークに使う。
  function likeCount(group: ThreadGroup): number {
    return group.root?.likedBy?.length ?? 0;
  }
  function tieBreakDate(group: ThreadGroup): string {
    if (group.root) return group.root.createdAt;
    const last = group.replies[group.replies.length - 1];
    return last?.createdAt ?? "";
  }

  return order
    .map((key) => groups.get(key)!)
    .sort((a, b) => {
      const diff = likeCount(b) - likeCount(a);
      if (diff !== 0) return diff;
      return tieBreakDate(b).localeCompare(tieBreakDate(a));
    });
}

/**
 * 物件ごとの会員限定掲示板。サインイン済みユーザーのみ閲覧・投稿できる
 * （未サインインはサインイン導線のみ表示、コメント本文は出さない）。
 * スレッド返信（1段グルーピング）と荒らし通報に対応。
 */
export default function PropertyComments({
  propertyId,
  comments: initialComments,
  currentUserId,
  currentUserName,
  isAdmin,
  signedIn,
  canPost = false,
  locale = "ja",
}: {
  propertyId: string;
  comments: CommentItem[];
  currentUserId: string | null;
  currentUserName?: string | null;
  isAdmin: boolean;
  signedIn: boolean;
  /** 書き込み（投稿・返信）権限。Studio / Team / admin のみ true。閲覧・いいねは会員全員。 */
  canPost?: boolean;
  locale?: "ja" | "en";
}) {
  const en = locale === "en";
  const [comments, setComments] = useState(initialComments);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [likePending, setLikePending] = useState<Set<string>>(new Set());
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const replyFormRef = useRef<HTMLFormElement>(null);
  const revalidate = `/properties/${propertyId}`;

  if (!signedIn) {
    return (
      <div className="border border-dashed border-line py-10 px-6 text-center bg-white">
        <p className="text-[13px] text-ink/60 mb-4">
          {en
            ? "Sign in to view this location's board (posting is available on Studio / Team plans)."
            : "サインインすると、この物件の掲示板を閲覧できます（書き込みは Studio / Team プラン）。"}
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
      parentId: "",
      reports: [],
      hiddenByReports: false,
    };
    setComments((c) => [...c, optimistic]);
    formRef.current?.reset();
    startTransition(async () => {
      const res = await postCommentAction(undefined, formData);
      if (res?.ok) {
        setComments((c) =>
          c.map((x) => (x.id === optimistic.id ? { ...res.comment, reports: [], hiddenByReports: false } : x)),
        );
      } else {
        setComments((c) => c.filter((x) => x.id !== optimistic.id));
        setError(res?.error ?? (en ? "Failed to post." : "投稿に失敗しました。"));
      }
    });
  };

  const onSubmitReply = (parentId: string) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setReplyError(null);
    const formData = new FormData(e.currentTarget);
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    const optimistic: CommentItem = {
      id: `__pending_${Date.now()}`,
      userId: currentUserId ?? "",
      userName: currentUserName || (en ? "You" : "自分"),
      body,
      createdAt: new Date().toISOString(),
      parentId,
      reports: [],
      hiddenByReports: false,
    };
    setComments((c) => [...c, optimistic]);
    setReplyOpenId(null);
    startTransition(async () => {
      const res = await postCommentAction(undefined, formData);
      if (res?.ok) {
        setComments((c) =>
          c.map((x) => (x.id === optimistic.id ? { ...res.comment, reports: [], hiddenByReports: false } : x)),
        );
      } else {
        setComments((c) => c.filter((x) => x.id !== optimistic.id));
        setReplyError(res?.error ?? (en ? "Failed to post." : "投稿に失敗しました。"));
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

  const onToggleLike = (id: string) => {
    if (!currentUserId || likePending.has(id)) return;
    const uid = currentUserId;
    // 楽観更新: 即座に自分の userId を追加/削除してからサーバーに反映。失敗時は戻す。
    const before = comments;
    setComments((c) =>
      c.map((x) => {
        if (x.id !== id) return x;
        const likedBy = x.likedBy ?? [];
        const liked = likedBy.includes(uid);
        return { ...x, likedBy: liked ? likedBy.filter((u) => u !== uid) : [...likedBy, uid] };
      }),
    );
    setLikePending((s) => new Set(s).add(id));
    startTransition(async () => {
      const res = await toggleCommentLikeAction(id);
      if (res.ok && res.likedBy) {
        const likedBy = res.likedBy;
        setComments((c) => c.map((x) => (x.id === id ? { ...x, likedBy } : x)));
      } else {
        setComments(before);
      }
      setLikePending((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    });
  };

  const onReport = (id: string) => {
    if (!confirm(en ? "Report this comment to the operator?" : "このコメントを運営に通報しますか？")) return;
    startTransition(async () => {
      const res = await reportCommentAction(id, revalidate);
      if (res.ok) {
        setReportedIds((s) => new Set(s).add(id));
        if (res.hidden && !isAdmin) {
          setComments((c) => c.filter((x) => x.id !== id));
        } else if (res.hidden) {
          setComments((c) => c.map((x) => (x.id === id ? { ...x, hiddenByReports: true } : x)));
        }
      }
    });
  };

  const onUnhide = (id: string) => {
    startTransition(async () => {
      const res = await unhideCommentAction(id, revalidate);
      if (res.ok) {
        setComments((c) => c.map((x) => (x.id === id ? { ...x, hiddenByReports: false, reports: [] } : x)));
      }
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

  const byId = new Map(comments.map((c) => [c.id, c]));
  const threads = groupIntoThreads(comments);

  const renderCard = (c: CommentItem, opts: { small?: boolean; replyToName?: string | null } = {}) => {
    const isPending = c.id.startsWith("__pending_");
    const isMine = c.userId === currentUserId;
    const isHidden = !!c.hiddenByReports;
    const alreadyReported = reportedIds.has(c.id) || (c.reports ?? []).some((r) => r.userId === currentUserId);

    if (isHidden && !isAdmin) return null; // 非adminには即時非表示（保険。通常はサーバー側でも除外済み）

    return (
      <div
        key={c.id}
        className={`relative border bg-white transition hover:border-ink/30 ${
          opts.small ? "px-3.5 py-3" : "px-4 py-3.5"
        } ${isHidden ? "border-amber-300 bg-amber-50/40" : "border-line"}`}
      >
        {isHidden && (
          <div className="mb-2 inline-flex items-center gap-2 mono text-[10px] text-amber-700 bg-amber-100 border border-amber-300 px-2 py-1">
            <span>{en ? "⚠ Hidden (reported)" : "⚠ 通報により非表示"}</span>
            <button
              type="button"
              onClick={() => onUnhide(c.id)}
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
            style={{ backgroundColor: avatarColor(c.userId) }}
          >
            {c.userName.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold">
              {c.userName}
              {isMine && (
                <span className="text-[9px] font-bold text-accent border border-accent rounded-[3px] px-1 ml-1 align-middle">
                  {en ? "You" : "自分"}
                </span>
              )}
              {opts.replyToName !== undefined && opts.replyToName !== null && (
                <span className="mono text-[9px] text-muted ml-1.5 align-middle">
                  ↪ {opts.replyToName}
                </span>
              )}
              {opts.replyToName === null && (
                <span className="mono text-[9px] text-muted ml-1.5 align-middle">
                  ↪ {en ? "deleted" : "削除済み"}
                </span>
              )}
            </div>
            <span className="mono text-[10px] text-muted">{fmt(c.createdAt)}</span>
          </div>
        </div>
        <p className="text-[13.5px] leading-[1.85] text-ink/90 whitespace-pre-line">{c.body}</p>

        {!isPending && (
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => onToggleLike(c.id)}
              disabled={likePending.has(c.id)}
              aria-pressed={(c.likedBy ?? []).includes(currentUserId ?? "")}
              aria-label={en ? "Like" : "いいね"}
              className="flex items-center gap-1 mono text-[10px] tracking-[0.1em] text-muted hover:text-accent transition disabled:opacity-50"
            >
              {(c.likedBy ?? []).includes(currentUserId ?? "") ? (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-accent" aria-hidden="true">
                  <path d="M12 21s-6.7-4.35-9.3-8.3C1.1 10.4 1.6 7.3 4 5.7c2-1.3 4.4-.8 5.9.9L12 8.6l2.1-2c1.5-1.7 3.9-2.2 5.9-.9 2.4 1.6 2.9 4.7 1.3 7-2.6 3.95-9.3 8.3-9.3 8.3z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-6.7-4.35-9.3-8.3C1.1 10.4 1.6 7.3 4 5.7c2-1.3 4.4-.8 5.9.9L12 8.6l2.1-2c1.5-1.7 3.9-2.2 5.9-.9 2.4 1.6 2.9 4.7 1.3 7-2.6 3.95-9.3 8.3-9.3 8.3z" />
                </svg>
              )}
              {(c.likedBy ?? []).length > 0 && <span className={(c.likedBy ?? []).includes(currentUserId ?? "") ? "text-accent" : ""}>{(c.likedBy ?? []).length}</span>}
            </button>
            {canPost && (
              <button
                type="button"
                onClick={() => setReplyOpenId((id) => (id === c.id ? null : c.id))}
                className="mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-accent transition"
              >
                {en ? "Reply" : "返信"}
              </button>
            )}
            {!isMine && (
              <button
                type="button"
                onClick={() => onReport(c.id)}
                disabled={alreadyReported || pending}
                className="mono text-[10px] tracking-[0.1em] uppercase text-muted hover:text-amber-600 transition disabled:opacity-50"
              >
                {alreadyReported ? (en ? "✓ Reported" : "✓ 通報済み") : en ? "🚩 Report" : "🚩 通報"}
              </button>
            )}
          </div>
        )}

        {(isMine || isAdmin) && !isPending && (
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

        {replyOpenId === c.id && (
          <form
            ref={replyFormRef}
            onSubmit={onSubmitReply(c.id)}
            className="mt-3 flex gap-2 items-start border border-dashed border-line bg-bg px-3 py-2.5"
          >
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="revalidate" value={revalidate} />
            <input type="hidden" name="parentId" value={c.id} />
            <div className="flex-1 min-w-0">
              <textarea
                name="body"
                required
                maxLength={1000}
                rows={2}
                placeholder={en ? "Write a reply…" : "返信を入力…"}
                className="w-full border-none bg-transparent text-[13px] leading-[1.8] resize-y min-h-[40px] focus:outline-none p-0"
              />
              {replyError && <p className="text-[12px] text-red-400 mt-1">{replyError}</p>}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="submit"
                disabled={pending}
                className="mono text-[10px] tracking-[0.15em] uppercase border border-accent text-accent px-3 py-1.5 hover:bg-accent hover:text-bg transition disabled:opacity-40"
              >
                {en ? "Reply" : "返信"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setReplyOpenId(null);
                  setReplyError(null);
                }}
                className="mono text-[10px] tracking-[0.15em] uppercase border border-line text-muted px-3 py-1.5 hover:border-ink/30 transition"
              >
                {en ? "Cancel" : "キャンセル"}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  const visibleThreads = showAllThreads ? threads : threads.slice(0, ROOT_PAGE_SIZE);

  return (
    <div>
      {threads.length === 0 ? (
        <p className="text-[13px] text-ink/40 py-6 text-center">
          {en ? "No comments yet. Be the first to post." : "まだコメントはありません。最初の投稿をどうぞ。"}
        </p>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {visibleThreads.map((group) => {
            const rootIsHiddenForNonAdmin = !!group.root?.hiddenByReports && !isAdmin;
            if (rootIsHiddenForNonAdmin && group.replies.length === 0) return null;

            const repliesExpanded = expandedReplies.has(group.rootKey);
            const visibleReplies = repliesExpanded
              ? group.replies
              : group.replies.slice(0, REPLY_PAGE_SIZE);
            const hiddenReplyCount = group.replies.length - visibleReplies.length;

            return (
              <div key={group.rootKey} className="flex flex-col gap-3">
                {group.root ? (
                  !rootIsHiddenForNonAdmin && renderCard(group.root)
                ) : (
                  <div className="border border-dashed border-line px-4 py-2 text-[11px] text-muted">
                    {en ? "(deleted comment)" : "（削除されたコメント）"}
                  </div>
                )}
                {group.replies.length > 0 && (
                  <div className="ml-10 pl-4 border-l-2 border-line flex flex-col gap-3">
                    {visibleReplies.map((r) => {
                      const directParent = r.parentId ? byId.get(r.parentId) : null;
                      // 直接の親がルートそのものなら "返信への返信" チップは出さない。
                      const isReplyToRoot = group.root ? r.parentId === group.root.id : false;
                      const replyToName = isReplyToRoot
                        ? undefined
                        : directParent
                          ? directParent.userName
                          : null;
                      return renderCard(r, { small: true, replyToName });
                    })}
                    {hiddenReplyCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReplies((s) => new Set(s).add(group.rootKey))
                        }
                        className="self-start mono text-[10px] tracking-[0.1em] text-accent hover:underline"
                      >
                        {en
                          ? `Show ${hiddenReplyCount} more repl${hiddenReplyCount === 1 ? "y" : "ies"}`
                          : `他${hiddenReplyCount}件の返信を表示`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {threads.length > ROOT_PAGE_SIZE && (
        <div className="flex justify-center mb-5">
          <button
            type="button"
            onClick={() => setShowAllThreads((v) => !v)}
            className="mono text-[10px] tracking-[0.18em] uppercase border border-line text-muted px-4 py-2 hover:border-ink/40 hover:text-ink transition"
          >
            {showAllThreads
              ? en
                ? "Collapse"
                : "折りたたむ"
              : en
                ? `Show all comments (${threads.length})`
                : `すべてのコメントを表示（全${threads.length}件）`}
          </button>
        </div>
      )}

      {!canPost && (
        <div className="border border-dashed border-line bg-bg px-5 py-5 text-center">
          <p className="text-[12.5px] text-ink/60 mb-3">
            {en
              ? "Posting to the board is available on the Studio / Team plans. Viewing and likes are open to all members."
              : "掲示板への書き込みは Studio / Team プランでご利用いただけます（閲覧・いいねは全会員可）。"}
          </p>
          <Link
            href={en ? "/en/pricing" : "/pricing"}
            className="inline-block mono text-[10.5px] tracking-[0.2em] uppercase border border-accent text-accent px-4 py-2 hover:bg-accent hover:text-bg transition"
          >
            {en ? "View plans →" : "プランを見る →"}
          </Link>
        </div>
      )}

      {canPost && (
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
      )}
    </div>
  );
}
