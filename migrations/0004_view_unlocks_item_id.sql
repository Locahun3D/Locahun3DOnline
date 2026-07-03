-- view_unlocks に splat_item_id を追加。
-- 旧方式は (property_id, splat_item_index) の配列位置でシーンを識別していたが、
-- 管理画面での並び替え・3DGSデータの差し替えで index がズレると、既に有効な
-- アンロックが「未アンロック」に見えてしまう問題があった。splatItem 側に永続
-- 識別子 id を追加し(schemas.ts)、以後のアンロックはこの id を主キーの一部に使う。
-- 既存行は splat_item_id が NULL のままでよい（hasValidUnlock が index ベースの
-- 旧キーにもフォールバックするため、過去のアンロックは壊れない）。
ALTER TABLE view_unlocks ADD COLUMN splat_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_view_unlocks_splat_item_id ON view_unlocks(splat_item_id);
