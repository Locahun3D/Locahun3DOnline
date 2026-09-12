import { requireAdmin } from "@/lib/dal";
import { getNotificationSummary } from "@/lib/notifications";
import { getLocale } from "@/lib/i18n/server";
import NotificationList from "@/components/account/notification-list";

export default async function AdminNotificationsPage() {
  const user = await requireAdmin();
  const locale = await getLocale();
  const en = locale === "en";
  const { notifications, unreadCount } = await getNotificationSummary(user.id, "admin", 100);
  return (
    <div className="ui-page-shell px-6 pb-12 sm:px-8">
      <header className="ui-page-header">
        <h1 className="ui-page-title">{en ? "Admin notifications" : "管理者向け通知"}</h1>
        <p className="ui-page-lead text-sm text-muted">
          {en ? "Requests and inquiries for administrators. Your personal notifications are in your account." : "管理者向けの申請・お問い合わせです。ご自身へのお知らせはマイページに表示されます。"}
        </p>
      </header>
      <NotificationList notifications={notifications} unreadCount={unreadCount} scope="admin" locale={locale} en={en} />
    </div>
  );
}
