-- ── contact_messages(問い合わせメールスレッド) ──────────────────
-- Cloudflare Email Routing(inbox.locahun3d.com サブドメイン) → email-worker/ が
-- 受信メールを書き込み、admin UI(/admin/contact-requests)がスレッド表示する。
-- 管理画面からの返信(replyToContactRequestAction)もここへ追記して1本の
-- スレッドに統合する。相手との紐付けは counterpart(相手メール小文字)の
-- 完全一致 — contact_requests.email と突き合わせる。
--
-- ⚠ ルートドメイン locahun3d.com の MX は Google Workspace。Email Routing は
-- サブドメインのみで有効化すること（ルートを切り替えると Workspace 受信が全滅）。
--
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。
-- email-worker は d1.ts を import できないため、INSERT の列とJSON形状を
-- src/lib/contact-messages.ts のスキーマと手動で一致させている。

CREATE TABLE IF NOT EXISTS contact_messages (
  id         TEXT PRIMARY KEY,   -- Message-ID(あれば) or ランダムUUID
  direction  TEXT NOT NULL,      -- 'inbound'(相手→当社) | 'outbound'(当社→相手)
  counterpart TEXT NOT NULL,     -- 相手側メールアドレス(小文字)
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_contact_messages_counterpart ON contact_messages(counterpart);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at);
