-- ── scan_submissions(持ち込みスキャン受付) ──────────────────────────
-- 撮影者が持ち込んだスキャン/CGデータを、当社が施設側と権利交渉して販売可否を
-- 決めるプログラムの受付。成立するまでは「非公開預かり」（無断スキャンを先に
-- 公開してから交渉する形は施設の信頼を壊す）。申請時に受け取るのは概要と
-- サンプル画像のみ — フルデータそのものはここに置かない（R2バケットが公開設定の
-- ままという既知の課題があるため）。フルデータの受け渡しは審査通過後に個別案内。
--
-- data 列は d1.ts のハイブリッド行モデル(実カラム + 完全JSON)前提のため必須
-- (0011 で bookmark_shares に data 列漏れの 500 バグがあった教訓)。
--
-- status: submitted → reviewing → clearing → cleared / rejected（後戻り可）。
CREATE TABLE IF NOT EXISTS scan_submissions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_scan_submissions_user ON scan_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_submissions_status ON scan_submissions(status);
CREATE INDEX IF NOT EXISTS idx_scan_submissions_created ON scan_submissions(created_at);
