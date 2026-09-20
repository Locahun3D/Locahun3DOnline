import { requireAdmin } from "@/lib/dal";
import { AdminPageShell } from "@/components/admin/admin-page-header";
import SubscriptionSummary from "@/components/admin/subscription-summary";

export const metadata = { title: "サブスク売上" };

/**
 * ページ本体は components/admin/subscription-summary.tsx へ切り出した。
 * /admin/analytics?tab=subscriptions からも同じ内容を表示するため
 * （運用担当の「サブスク売上まで潜るのが面倒」への対応）。
 */
export default async function SubscriptionsPage() {
  await requireAdmin();
  return (
    <AdminPageShell>
      <SubscriptionSummary />
    </AdminPageShell>
  );
}
