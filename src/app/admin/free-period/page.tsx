import { requireAdmin } from "@/lib/dal";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive } from "@/lib/settings-schema";
import FreePeriodForm from "@/components/admin/free-period-form";

export const metadata = { title: "限定無料期間" };

export default async function AdminFreePeriodPage() {
  await requireAdmin();
  const settings = await getSettings();
  const active = isFreePeriodActive(settings.freePeriod, new Date().toISOString());

  return (
    <div className="p-8 max-w-3xl">
      <header className="mb-8">
        <h1 className="serif text-3xl font-bold">限定無料期間</h1>
        <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
          設定した期間中は、すべてのスタジオの 3DGS ウォークスルーが
          <strong className="text-ink">トークン消費なし</strong>で閲覧できます。
          ローンチ記念や期間限定キャンペーンにご利用ください。
        </p>
      </header>

      <FreePeriodForm freePeriod={settings.freePeriod} active={active} />
    </div>
  );
}
