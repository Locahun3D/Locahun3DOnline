import { requireAdmin } from "@/lib/dal";
import { repo, assetRepo } from "@/lib/store";
import { computeAssetUsage } from "@/lib/asset-usage";
import AdminPageHeader, { AdminPageShell } from "@/components/admin/admin-page-header";
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
    <AdminPageShell>
      {/* 2026-09-20: 管理画面共通の小型ヘッダー。説明は1行に短縮。 */}
      <AdminPageHeader title="アセット" description="物件フォルダごとに画像・3DGSを管理します。" />
      <AssetLibrary initialAssets={assets} usage={usage} properties={folderProperties} />
    </AdminPageShell>
  );
}
