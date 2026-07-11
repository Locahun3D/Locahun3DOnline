import { requireAdmin } from "@/lib/dal";
import { giftCodeRepo } from "@/lib/gift-codes";
import { getSettings } from "@/lib/site-settings";
import { isFreePeriodActive, dataSalePeriodStatus } from "@/lib/settings-schema";
import GiftCodeAdmin from "@/components/admin/gift-code-admin";
import FreePeriodForm from "@/components/admin/free-period-form";
import DataSaleFreePeriodForm from "@/components/admin/data-sale-free-period-form";

export const metadata = { title: "ギフトコード・無料期間" };

export default async function AdminGiftCodesPage() {
  await requireAdmin();
  const [codes, settings] = await Promise.all([giftCodeRepo.list(), getSettings()]);
  const now = new Date().toISOString();
  const active = isFreePeriodActive(settings.freePeriod, now);
  const dataSaleStatus = dataSalePeriodStatus(settings.dataSaleFreePeriod, now);

  return (
    <div className="p-8 max-w-5xl space-y-12">
      <section>
        <header className="mb-8">
          <h1 className="serif text-3xl font-bold">ギフトコード</h1>
          <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
            トークン数を設定したコードを発行し、ユーザーに渡せます。受け取った人は
            マイページの「ギフトコードを引き換え」から入力してトークンを受け取ります。
          </p>
        </header>

        <GiftCodeAdmin codes={codes} />
      </section>

      <section className="border-t border-line pt-10">
        <header className="mb-6">
          <h2 className="serif text-2xl font-bold">限定無料期間</h2>
          <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
            設定した期間中は、すべてのスタジオの 3DGS ウォークスルーが
            <strong className="text-ink">トークン消費なし</strong>で閲覧できます。
            ローンチ記念や期間限定キャンペーンにご利用ください。
          </p>
        </header>

        <FreePeriodForm freePeriod={settings.freePeriod} active={active} />
      </section>

      <section className="border-t border-line pt-10">
        <header className="mb-6">
          <h2 className="serif text-2xl font-bold">3Dデータ販売 限定無料期間</h2>
          <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
            設定した期間中は、「販売中」に設定した3DデータのDL購入がすべて
            <strong className="text-ink">¥0</strong>になります。上のウォークスルー閲覧の
            無料期間とは別に管理され、終了日を過ぎた後の挙動（通常価格に戻す／無料のまま／
            販売停止）も選べます。
          </p>
        </header>

        <DataSaleFreePeriodForm
          freePeriod={settings.dataSaleFreePeriod}
          status={dataSaleStatus}
        />
      </section>
    </div>
  );
}
