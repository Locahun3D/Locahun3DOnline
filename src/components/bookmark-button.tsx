"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleBookmarkAction } from "@/lib/bookmark-actions";

/**
 * 物件ブックマーク（保存）ボタン。
 * - 未サインイン: クリックで /sign-in へ誘導。
 * - サインイン済み: 楽観更新でトグルし、サーバーアクションで永続化。
 * variant="overlay" はカード上のアイコンボタン、"inline" は詳細ページのラベル付き。
 */
export default function BookmarkButton({
  propertyId,
  initialBookmarked,
  signedIn,
  revalidate,
  variant = "inline",
}: {
  propertyId: string;
  initialBookmarked: boolean;
  signedIn: boolean;
  revalidate?: string;
  variant?: "overlay" | "inline";
}) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();

  const onClick = (e: React.MouseEvent) => {
    // カード全体がリンクの場合、リンク遷移を止める。
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const next = !bookmarked;
    setBookmarked(next); // 楽観更新
    startTransition(async () => {
      const res = await toggleBookmarkAction(propertyId, revalidate);
      if (!res.ok) setBookmarked(!next); // 失敗時ロールバック
      else setBookmarked(res.bookmarked);
    });
  };

  const label = bookmarked ? "保存済み" : "保存する";
  const star = bookmarked ? "★" : "☆";

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={label}
        title={label}
        className={`grid place-items-center w-8 h-8 rounded-sm border backdrop-blur transition ${
          bookmarked
            ? "border-accent bg-accent/90 text-bg"
            : "border-line bg-bg/75 text-ink hover:border-accent hover:text-accent"
        } ${pending ? "opacity-60" : ""}`}
      >
        <span className="text-[15px] leading-none">{star}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={bookmarked}
      className={`inline-flex items-center gap-2 mono text-[11px] tracking-[0.18em] uppercase border px-4 py-2.5 transition ${
        bookmarked
          ? "border-accent text-accent bg-accent/10"
          : "border-line text-ink hover:border-accent hover:text-accent"
      } ${pending ? "opacity-60" : ""}`}
    >
      <span className="text-[14px] leading-none">{star}</span>
      {label}
    </button>
  );
}
