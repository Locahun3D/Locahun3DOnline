-- ── deleted_accounts(削除アカウントのアーカイブ) ──────────────────────
-- 管理画面からのアカウント削除を「物理削除」から「アーカイブ + 理由必須」に変更した
-- ための保存先（誤操作からの復旧と、なぜ消したかの説明責任のため）。
--
-- ⚠ なぜ users に soft-delete 列を足さなかったか（判断の記録）:
--   1) users には `CREATE UNIQUE INDEX idx_users_email ON users(email_lower)` がある。
--      行を残したまま status だけ変える方式だと、同じメールアドレスで二度と再登録
--      できなくなる（Clerk 側で作り直しても app 側 upsert が unique 衝突で落ちる）。
--   2) userRepo.list() の呼び出し元は admin だけではない（サブスク集計 MRR/有料会員数、
--      一括操作、メール配信の宛先など）。行を残すと、それら全部に「削除済みなのに
--      生きている」ユーザーが混ざる。全呼び出し元にフィルタを足すのは漏れが出る。
--   3) users に列を足す場合もどのみちマイグレーションは必要（userCols() に足した列が
--      実スキーマに無いと d1Upsert が "no such column" で落ちる — 既知の罠）。
--   → users からは今まで通り消し、完全なJSONスナップショットをこの別テーブルへ退避する。
--
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。
CREATE TABLE IF NOT EXISTS deleted_accounts (
  id          TEXT PRIMARY KEY,   -- 削除された Clerk userId（同一IDの再削除は上書き）
  email_lower TEXT,               -- 検索用（UNIQUE にしない: 再登録→再削除を許容する）
  deleted_at  TEXT NOT NULL,
  deleted_by  TEXT,               -- 実行した管理者の userId
  data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_email ON deleted_accounts(email_lower);
CREATE INDEX IF NOT EXISTS idx_deleted_accounts_at ON deleted_accounts(deleted_at);
