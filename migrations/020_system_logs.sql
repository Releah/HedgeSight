CREATE TABLE IF NOT EXISTS system_log_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  minimum_level text NOT NULL DEFAULT 'info' CHECK (minimum_level IN ('debug','info','warn','error')),
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_log_settings(id) VALUES(true) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS system_logs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('debug','info','warn','error')),
  source text NOT NULL,
  category text NOT NULL,
  message text NOT NULL CHECK (length(message)<=4000),
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS system_logs_created_idx ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_level_created_idx ON system_logs(level,created_at DESC);
CREATE INDEX IF NOT EXISTS system_logs_search_idx ON system_logs USING gin(to_tsvector('simple',message));
