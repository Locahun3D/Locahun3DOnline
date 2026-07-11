"use client";

import Link from "next/link";
import { useTransition } from "react";
import { markNotificationsReadAction } from "@/lib/notification-actions";
import type { Notification } from "@/lib/notifications";

/**
 * マイページ上部の通知一覧（問い合わせ返信など）。通知が0件なら何も描画しない
 * （常設カードにすると空でも場所を取り、他のカード群より優先度が低いのに
 * 目立ってしまうため）。
 */
export default function NotificationList({
  notifications,
  en,
  lh,
}: {
  notifications: Notification[];
  en: boolean;
  lh: (href: string) => string;
}) {
  const [pending, startTransition] = useTransition();
  if (notifications.length === 0) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="bg-white border border-[#e2e7ec] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[10px] tracking-[0.24em] uppercase text-[#7b8794]">
          {en ? "Notifications" : "お知らせ"}
          {unreadCount > 0 && (
            <span className="ml-2 inline-block bg-[#1ea0c4] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => markNotificationsReadAction())}
            className="mono text-[10px] tracking-[0.18em] uppercase text-[#1ea0c4] hover:underline disabled:opacity-50"
          >
            {en ? "Mark all read" : "すべて既読にする"}
          </button>
        )}
      </div>
      <ul className="divide-y divide-[#e2e7ec]">
        {notifications.slice(0, 8).map((n) => (
          <li key={n.id} className="py-3 first:pt-0 last:pb-0">
            <Link href={lh(n.link)} className="block group">
              <div className="flex items-start gap-2">
                {!n.read && (
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#1ea0c4] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-[13px] text-[#14181c] group-hover:text-[#1ea0c4] transition leading-[1.6]">
                    {n.title}
                  </div>
                  <div className="text-[12px] text-[#7b8794] mt-0.5 leading-[1.6] line-clamp-2">
                    {n.body}
                  </div>
                  <div className="mono text-[10px] text-[#7b8794] mt-1">
                    {n.createdAt.slice(0, 16).replace("T", " ")}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
