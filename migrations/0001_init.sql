-- D1 初期スキーマ。
-- 方針: 各エンティティは「クエリ/原子更新に使う実カラム + data(完全な検証済みJSON)」の
-- ハイブリッド行。ネスト配列(splatItems/gallery/redemptions 等)は data に内包し、
-- 読込側で既存の zod スキーマで検証・salvage する。analytics のみカウンタを正規化して
-- SQL の UPSERT インクリメントで原子的に加算する(read-modify-write のレース解消)。

-- ── properties ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id          TEXT PRIMARY KEY,
  status      TEXT,
  visibility  TEXT,
  category    TEXT,
  owner_id    TEXT,
  created_at  TEXT,
  updated_at  TEXT,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_properties_status     ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_owner      ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_updated_at ON properties(updated_at);

-- ── assets(メディアのメタデータ。実体は R2 の r2Key) ─────────
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  kind        TEXT,
  status      TEXT,
  uploaded_at TEXT,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_kind   ON assets(kind);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);

-- ── users(id = Clerk userId) ────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email_lower TEXT,
  role        TEXT,
  status      TEXT,
  created_at  TEXT,
  data        TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email_lower);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ── purchases(原子性: stripe_session_id ユニーク + 冪等 status 遷移) ──
CREATE TABLE IF NOT EXISTS purchases (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  property_id       TEXT,
  splat_item_index  INTEGER,
  status            TEXT,
  stripe_session_id TEXT,
  created_at        TEXT,
  data              TEXT NOT NULL
);
-- SQLite の UNIQUE は NULL を相異なる値として扱うため、pending(session未確定)の
-- 複数 NULL は許容しつつ、確定済み session の重複は禁止できる。
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_session ON purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user     ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_property ON purchases(property_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status   ON purchases(status);

-- ── gift_codes(原子性: uses < max_uses の条件付き UPDATE で CAS) ──
CREATE TABLE IF NOT EXISTS gift_codes (
  code       TEXT PRIMARY KEY,
  uses       INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  status     TEXT,
  expires_at TEXT,
  created_at TEXT,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_status ON gift_codes(status);

-- ── inquiries(問い合わせ) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiries (
  id          TEXT PRIMARY KEY,
  property_id TEXT,
  status      TEXT,
  created_at  TEXT,
  data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status   ON inquiries(status);

-- ── site_settings(シングルトン) ─────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);

-- ── analytics(カウンタ正規化 → UPSERT で原子的に加算) ────────
CREATE TABLE IF NOT EXISTS analytics_prop (
  property_id TEXT PRIMARY KEY,
  views       INTEGER NOT NULL DEFAULT 0,
  opens       INTEGER NOT NULL DEFAULT 0,
  purchases   INTEGER NOT NULL DEFAULT 0,
  refunds     INTEGER NOT NULL DEFAULT 0,
  revenue     INTEGER NOT NULL DEFAULT 0,
  last_at     TEXT
);
CREATE TABLE IF NOT EXISTS analytics_daily (
  property_id TEXT NOT NULL,
  day         TEXT NOT NULL,
  v           INTEGER NOT NULL DEFAULT 0,
  o           INTEGER NOT NULL DEFAULT 0,
  p           INTEGER NOT NULL DEFAULT 0,
  r           INTEGER NOT NULL DEFAULT 0,
  rev         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, day)
);
CREATE TABLE IF NOT EXISTS analytics_referrer (
  property_id TEXT NOT NULL,
  source      TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, source)
);
CREATE TABLE IF NOT EXISTS analytics_device (
  property_id TEXT NOT NULL,
  device      TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, device)
);
