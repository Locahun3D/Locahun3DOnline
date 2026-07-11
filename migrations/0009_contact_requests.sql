-- ── contact_requests(サイト全体向け一般お問い合わせ) ────────────────────
-- /contact（ナビ 0.4）。物件に紐付く既存の inquiries とは別モデル
-- （propertyId を持たず、運営メールへ転送する）。
-- 種別: bug(バグ報告) / request(ほしい物件追加) / listing(掲載依頼) / general(ご相談)
CREATE TABLE IF NOT EXISTS contact_requests (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_requests_type ON contact_requests(type);
CREATE INDEX IF NOT EXISTS idx_contact_requests_status ON contact_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created ON contact_requests(created_at);
