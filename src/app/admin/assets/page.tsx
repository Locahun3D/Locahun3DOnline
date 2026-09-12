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
  // フォルダ表示用の軽量な物件メタ（アセット本体とは独立にpropertyIdから引く）。
  const folderProperties = properties.map((p) => ({
    id: p.id,
    title: p.title || p.id,
    cover: p.cover?.src || "",
  }));
  return (
    <div className="ui-page-shell px-6 pb-6">
      <header className="ui-page-header">
      <h1 className="ui-page-title">アセットライブラリ</h1>
      <p className="ui-page-lead text-muted text-[13px]">
        物件フォルダごとにアセットを管理します。フォルダ内はさらに画像・3DGS等の種別で整理。
        物件編集では「ライブラリから選択」で紐付け。
      </p>
      </header>
      <AssetLibrary initialAssets={assets} usage={usage} properties={folderProperties} />
    </div>
  );
}
