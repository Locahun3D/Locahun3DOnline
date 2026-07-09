-- ── comments(物件ごとの会員限定掲示板) ───────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  property_id TEXT,
  user_id     TEXT,
  created_at  TEXT,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_property ON comments(property_id);
CREATE INDEX IF NOT EXISTS idx_comments_user     ON comments(user_id);
