-- ── viewer_shares（3DGSビューアーの共有URL） ─────────────────────
-- Team プラン（最上位）の利用者が、自分が視聴できるシーンを「ログイン不要・期限付き（既定7日）」で
-- 第三者に見せるためのリンク。token -> (property_id, splat_item_id, asset_key)。
-- property_previews と違い 1シーン単位で、発行者(created_by)を持つ。失効は行削除。
-- data 列は d1.ts のハイブリッド行モデル前提のため必須（0012 のコメント参照）。
CREATE TABLE IF NOT EXISTS viewer_shares (
  token         TEXT PRIMARY KEY,
  property_id   TEXT NOT NULL,
  splat_item_id TEXT NOT NULL,
  asset_key     TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_viewer_shares_creator ON viewer_shares(created_by, asset_key);
