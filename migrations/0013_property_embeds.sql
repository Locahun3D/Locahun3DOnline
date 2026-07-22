-- ── property_embeds(掲載者サイトへの3Dツアー埋め込みURL) ──────────
-- 掲載者が自社サイトへ iframe で貼るための公開URL(DECISION_LOG D-008 の
-- ホスティング商品)。token -> (property_id) の逆引き。1物件1トークン
-- (再発行で置換)。
--
-- property_previews との違い(同型だが用途が逆なので別テーブル):
--   previews … 公開前の社内確認用。期限あり(30日)。expires_at を持つ。
--   embeds   … 掲載者サイトでの常設公開用。**期限なし**。代わりに enabled で
--              掲載者が一時停止できる(失効=行削除とは区別する)。
--
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。
CREATE TABLE IF NOT EXISTS property_embeds (
  token       TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_property_embeds_property ON property_embeds(property_id);
