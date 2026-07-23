-- ── 収益分配システム Phase 1（分配台帳＋精算） ──────────────────
-- 撮影者（ユーザー）が持ち込んだスキャンデータを、当社が施設と権利交渉して
-- 販売する仕組みの支払い基盤。売主は常に当社であり、撮影者・施設への支払いは
-- 「販売代金の分配」ではなく当社からの使用料の後払い。DECISION_LOG D-005
-- （施設への20%還元・年1回精算・最低支払¥10,000・未満繰越）もこの台帳に
-- 統合する設計。詳細は src/lib/payouts.ts のコメント参照。
--
-- ⚠ payees テーブルは銀行口座情報を含むため取り扱い注意（admin専用アクセス、
-- ローカル開発では data/payees.json が対応し .gitignore 済み）。
--
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。

-- 受取者（撮影者 / 施設）。
CREATE TABLE IF NOT EXISTS payees (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'scanner' | 'venue'
  entity_type TEXT NOT NULL,          -- 'individual' | 'corporation'
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}'
);

-- 物件ごとの分配設定（1物件1行、行内に payee/role/rate の配列を JSON で保持）。
CREATE TABLE IF NOT EXISTS payout_splits (
  property_id TEXT PRIMARY KEY,
  updated_at  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}'
);

-- 分配台帳。1販売×1受取者=1行。status: 'accrued' | 'settled' | 'voided'。
CREATE TABLE IF NOT EXISTS payout_ledger (
  id            TEXT PRIMARY KEY,
  purchase_id   TEXT NOT NULL,
  property_id   TEXT NOT NULL,
  payee_id      TEXT NOT NULL,
  status        TEXT NOT NULL,
  settlement_id TEXT,
  created_at    TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_payee_status ON payout_ledger(payee_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_purchase ON payout_ledger(purchase_id);

-- 精算。status: 'draft' | 'paid'。
CREATE TABLE IF NOT EXISTS payout_settlements (
  id          TEXT PRIMARY KEY,
  payee_id    TEXT NOT NULL,
  status      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_payout_settlements_payee ON payout_settlements(payee_id);
