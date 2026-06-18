import { requireAdmin } from "@/lib/dal";
import { giftCodeRepo } from "@/lib/gift-codes";
import GiftCodeAdmin from "@/components/admin/gift-code-admin";

export const metadata = { title: "ギフトコード" };

export default async function AdminGiftCodesPage() {
  await requireAdmin();
  const codes = await giftCodeRepo.list();

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="serif text-3xl font-bold">ギフトコード</h1>
        <p className="text-[13px] text-muted mt-2 leading-[1.8] max-w-[60ch]">
          トークン数を設定したコードを発行し、ユーザーに渡せます。受け取った人は
          マイページの「ギフトコードを引き換え」から入力してトークンを受け取ります。
        </p>
      </header>

      <GiftCodeAdmin codes={codes} />
    </div>
  );
}
