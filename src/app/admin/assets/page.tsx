import { requireAdmin } from "@/lib/dal";
import { repo, assetRepo } from "@/lib/store";
import { computeAssetUsage } from "@/lib/asset-usage";
import AssetLibrary from "@/components/admin/asset-library";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  await requireAdmin();
  const [assets, properties] = await Promise.all([
    assetRepo.list(),
    repo.list(),
  ]);
  const usage = computeAssetUsage(properties, assets);
  return (
    <div className="p-6">
      <h1 className="text-xl font-serif mb-1">アセットライブラリ</h1>
      <p className="text-muted text-[13px] mb-5">
        画像・3DGS を物件と切り離して管理します。物件編集では「ライブラリから選択」で紐付け。
      </p>
      <AssetLibrary initialAssets={assets} usage={usage} />
    </div>
  );
}
