"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { markNotificationsReadAction } from "@/lib/notification-actions";
import type { Notification } from "@/lib/notifications";
import { localizedHref, type Locale } from "@/lib/i18n/dictionaries";
import { fmtDateTimeLocaleJST } from "@/lib/date-format";

/**
 * ヘッダーの通知ベル。以前は /account#notifications への単なるリンクで、押すと
 * マイページへ全画面遷移するだけ（通知内容はその場で見られなかった）。ここを
 * 「押すとその場で最近の通知一覧をドロップダウン表示」に変更。各通知はクリックで
 * 該当先へ遷移し、下部の「すべての通知を見る → マイページ」で従来の一覧へ。未読が
 * あれば「すべて既読」ボタンを出す。
 *
 * ⚠ Server Component から渡せるのはシリアライズ可能な値のみ（関数 props を渡すと
 * /account が 500 になった実害あり）。locale は文字列で受け取り内部で localizedHref
 * を呼ぶ（notification-list.tsx と同じ流儀）。
 */
export default function NotificationBell({
  notifications,
  unreadCount,
  locale,
  en,
}: {
  notifications: Notification[];
  unreadCount: number;
  locale: Locale;
  en: boolean;
}) {
  const lh = (href: string) => localizedHref(href, locale);
  const [open, setOpen] = useState(false);
  // 既読化はサーバー再取得を待たず即バッジを消す（楽観更新）。
  const [locallyRead, setLocallyRead] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  const effUnread = locallyRead ? 0 : unreadCount;
  const recent = notifications.slice(0, 6);

  // 外側クリック・Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = () => {
    setLocallyRead(true);
    startTransition(() => markNotificationsReadAction());
  };

  return (
    <div className="relative flex items-center" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          en
            ? `Notifications${effUnread > 0 ? ` (${effUnread} unread)` : ""}`
            : `通知${effUnread > 0 ? `（未読${effUnread}件）` : ""}`
        }
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex items-center text-muted hover:text-accent transition whitespace-nowrap"
        title={en ? "Notifications" : "通知"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="w-4 h-4 min-[720px]:w-[18px] min-[720px]:h-[18px]"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {effUnread > 0 && (
          <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-bg mono text-[9px] font-bold">
            {effUnread > 9 ? "9+" : effUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(92vw,360px)] max-h-[70vh] overflow-auto bg-white border border-[#e2e7ec] shadow-[0_8px_28px_rgba(0,0,0,0.18)] z-50 text-left">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e7ec] sticky top-0 bg-white">
            <span className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794]">
              {en ? "Notifications" : "お知らせ"}
            </span>
            {effUnread > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={markRead}
                className="mono text-[10px] tracking-[0.18em] uppercase text-[#1ea0c4] hover:underline disabled:opacity-50"
              >
                {en ? "Mark all read" : "すべて既読"}
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-7 text-center text-[12px] text-[#7b8794] leading-[1.7]">
              {en ? "No notifications yet" : "新しいお知らせはありません"}
            </div>
          ) : (
            <ul className="divide-y divide-[#e2e7ec]">
              {recent.map((n) => (
                <li key={n.id}>
                  <Link
                    href={lh(n.link)}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 hover:bg-[#f5f8fa] transition group"
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && !locallyRead && (
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1ea0c4] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[13px] text-[#14181c] group-hover:text-[#1ea0c4] transition leading-[1.5]">
                          {n.title}
                        </div>
                        <div className="text-[12px] text-[#7b8794] mt-0.5 leading-[1.5] line-clamp-2">
                          {n.body}
                        </div>
                        <div className="mono text-[10px] text-[#7b8794] mt-1">
                          {fmtDateTimeLocaleJST(n.createdAt, en ? "en-US" : "ja-JP")}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={lh("/account#notifications")}
            onClick={() => setOpen(false)}
            className="block px-4 py-3 border-t border-[#e2e7ec] text-center mono text-[10px] tracking-[0.18em] uppercase text-[#1ea0c4] hover:bg-[#f5f8fa] transition sticky bottom-0 bg-white"
          >
            {en ? "View all →" : "すべての通知を見る →"}
          </Link>
        </div>
      )}
    </div>
  );
}
