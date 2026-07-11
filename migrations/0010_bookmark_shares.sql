-- ── bookmark_shares(ブックマーク・フォルダの共有URL) ────────────────
-- Studio/Team プランで発行できる、フォルダ単位の読み取り専用共有リンク。
-- token -> (userId, folderId) の逆引きに使う。フォルダ本体(users.data内の
-- bookmarkFolders)はこのテーブルを持たないので、token失効はここの行削除のみ。
CREATE TABLE IF NOT EXISTS bookmark_shares (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  folder_id  TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmark_shares_user ON bookmark_shares(user_id);
