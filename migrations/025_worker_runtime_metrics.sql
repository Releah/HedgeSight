ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS runtime_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

