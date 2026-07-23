import Link from "next/link";

/**
 * ヘッダーの通知ベル。マイページ上部の NotificationList への入口
 * （/account#notifications）。未読件数はサーバー側で集計済みの値を
 * そのまま受け取るだけの表示専用コンポーネント（クライアント側ポーリングはしない）。
 */
export default function NotificationBell({
  unreadCount,
  href,
  en,
}: {
  unreadCount: number;
  href: string;
  en: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={en ? `Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}` : `通知${unreadCount > 0 ? `（未読${unreadCount}件）` : ""}`}
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
        className="w-4 h-4 min-[768px]:w-[18px] min-[768px]:h-[18px]"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-bg mono text-[9px] font-bold">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
