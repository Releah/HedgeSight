CREATE TABLE IF NOT EXISTS backup_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('network_script','server_files')),
  script text NOT NULL DEFAULT '',
  paths text[] NOT NULL DEFAULT '{}',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind='network_script' AND length(trim(script))>0) OR (kind='server_files' AND cardinality(paths)>0))
);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  profile_id uuid NOT NULL REFERENCES backup_profiles(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  ssh_port integer NOT NULL DEFAULT 22 CHECK (ssh_port BETWEEN 1 AND 65535),
  interval_seconds integer NOT NULL CHECK (interval_seconds BETWEEN 300 AND 31536000),
  retention_count integer NOT NULL DEFAULT 30 CHECK (retention_count BETWEEN 1 AND 1000),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_status text NOT NULL DEFAULT 'never' CHECK (last_status IN ('never','queued','running','success','failed')),
  last_message text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','success','failed','expired')),
  leased_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  message text,
  size_bytes bigint,
  content_hash text,
  encrypted_content bytea,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_backup_run_per_job ON backup_runs(job_id) WHERE state IN ('queued','leased');
CREATE INDEX IF NOT EXISTS backup_runs_job_created_idx ON backup_runs(job_id,created_at DESC);
