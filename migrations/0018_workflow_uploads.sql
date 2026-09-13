CREATE TABLE IF NOT EXISTS workflow_uploads (
  job_key TEXT PRIMARY KEY,
  binding TEXT NOT NULL,
  asset_id TEXT NOT NULL UNIQUE
);
