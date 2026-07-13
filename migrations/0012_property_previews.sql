-- ── property_previews(物件の限定プレビュー共有URL) ──────────────
-- 先方スタジオに「公開前の物件」(draft/archived/confidential 含む)を確認して
-- もらうための、ログイン不要・期限付き(既定30日)・失効可能な共有リンク。
-- token -> (property_id) の逆引き。1物件1トークン(再発行で置換)。
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。
CREATE TABLE IF NOT EXISTS property_previews (
  token       TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_property_previews_property ON property_previews(property_id);
