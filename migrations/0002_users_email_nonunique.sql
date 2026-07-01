-- users.email_lower の UNIQUE を解除して通常 index にする。
-- 理由: repo の upsert は `ON CONFLICT(id) DO UPDATE`（id を conflict target）で行うが、
-- SQLite の ON CONFLICT はその target の制約しか吸収しない。同一行の再 upsert でも
-- 別の UNIQUE(email_lower) 制約に引っかかり "UNIQUE constraint failed: users.email_lower"
-- で落ちていた（getCurrentUser の毎リクエスト upsert が全認証ページを 500 に）。
-- メール一意性は Clerk（ID プロバイダ）が上流で担保するため、DB は高速参照用の
-- 通常 index で十分。
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email_lower);
