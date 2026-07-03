-- ── view_unlocks(視聴アンロック記録) ────────────────────────
-- サブスク会員が 3DGS シーン（splatItem 単位）を初めて開くと tokenCost トークンを
-- 消費し、その「アンロック」をここに記録する。一度アンロックしたシーンは 2 年間
-- （expires_at まで）無償で再視聴できる。物件に複数シーンがある場合は
-- (property_id, splat_item_index) の組でシーンごとに独立してアンロックする。
--
-- id = `${userId}:${propertyId}:${splatItemIndex}` の自然キーなので、同一シーンの
-- 再アンロックは同じ id になり、ON CONFLICT(id) の upsert が冪等（リトライで二重
-- 生成しない）。他テーブルと同じハイブリッド行（実カラム + data JSON）。
CREATE TABLE IF NOT EXISTS view_unlocks (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  property_id       TEXT,
  splat_item_index  INTEGER,
  expires_at        TEXT,
  created_at        TEXT,
  data              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_view_unlocks_user     ON view_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_view_unlocks_property ON view_unlocks(property_id);
CREATE INDEX IF NOT EXISTS idx_view_unlocks_expires  ON view_unlocks(expires_at);
