-- ── analytics_events(個別イベントログ) ────────────────────────
-- analytics_prop等の正規化テーブルは集計カウンタのみで「誰が見たか」を
-- 後から辿れない。物件詳細ページの閲覧(view)・3DGSビューアー起動(viewer_open)
-- を1行=1イベントで記録し、管理画面の「最近の閲覧者」で使う。
-- サインイン済みユーザーのみ user_id/user_email が入る（匿名は null のまま
-- ＝プライバシー上、未サインインの個人を特定する情報は持たない）。
--
-- ⚠ 無期限に行が増え続ける設計。将来的に規模が増えたら古い行を間引く
-- 仕組み（cronでの定期削除等）が必要になる。
CREATE TABLE IF NOT EXISTS analytics_events (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL,
  type         TEXT NOT NULL,
  user_id      TEXT,
  user_email   TEXT,
  referrer     TEXT,
  device       TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_property ON analytics_events(property_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created  ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user     ON analytics_events(user_id);
