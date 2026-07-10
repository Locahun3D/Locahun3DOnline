-- ── reviews(物件ごとのレビュー・評価 ★1-5 + 任意本文) ───────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  property_id TEXT,
  user_id     TEXT,
  created_at  TEXT,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_property ON reviews(property_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON reviews(user_id);
