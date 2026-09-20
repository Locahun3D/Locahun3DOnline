import { requireAdmin } from "@/lib/dal";
import { getNotificationSummary } from "@/lib/notifications";
import { getLocale } from "@/lib/i18n/server";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
import NotificationList from "@/components/account/notification-list";

export default async function AdminNotificationsPage() {
  const user = await requireAdmin();
  const locale = await getLocale();
  const en = locale === "en";
  const { notifications, unreadCount } = await getNotificationSummary(user.id, "admin", 100);
  return (
    <AdminPageShell>
      {/* 2026-09-20: 見出しを管理画面共通の小型ヘッダーへ。説明は1行に短縮。 */}
      <AdminPageHeader
        title={en ? "Notifications" : "通知"}
        description={en ? "Requests and inquiries for administrators." : "管理者宛の申請・問い合わせです。"}
      />
      <NotificationList notifications={notifications} unreadCount={unreadCount} scope="admin" locale={locale} en={en} />
    </AdminPageShell>
  );
}
