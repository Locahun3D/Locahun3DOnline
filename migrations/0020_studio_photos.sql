-- ── studio_photos(スタジオが確認メールから送ってきた掲載用の写真) ──────────────
-- 2026-09-26 本人指示。スタジオはプレビュー画面から写真を投稿でき、運営が
-- 採用/却下するまで**どこにも公開されない**（実体は R2 の quarantine/ 配下）。
--
-- ⚠ 物件JSON(properties.data)に入れない理由: 物件JSONは公開ページのクライアントへ
--   そのまま渡るため、未採用の写真の保存キーが外に出てしまう。別表にして、
--   管理画面（要ログイン）からしか辿れないようにする。
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須。
CREATE TABLE IF NOT EXISTS studio_photos (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_studio_photos_property ON studio_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_studio_photos_status ON studio_photos(status);
