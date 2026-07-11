-- ── bookmark_shares に data 列を追加 ──────────────────────────
-- 0010 が data 列を含めずに作成してしまったバグの修正。d1.ts の
-- 共通ヘルパー(d1GetData/d1ListData/d1Upsert)は全テーブルが
-- 「実カラム + data(完全なJSON)」のハイブリッド行モデルである前提で
-- 動くため、data列が無いと SELECT data ... が SQLエラーになる
-- （本番で /s/[token] が 500 になっていたのはこれが原因）。
ALTER TABLE bookmark_shares ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
