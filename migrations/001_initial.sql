CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('up', 'down', 'degraded', 'unknown')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ping', 'http', 'snmp', 'ssh')),
  enabled boolean NOT NULL DEFAULT true,
  interval_seconds integer NOT NULL DEFAULT 60 CHECK (interval_seconds >= 10),
  timeout_ms integer NOT NULL DEFAULT 5000 CHECK (timeout_ms BETWEEN 250 AND 120000),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'unknown' CHECK (last_status IN ('up', 'down', 'degraded', 'unknown')),
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  version text NOT NULL DEFAULT 'unknown',
  capabilities text[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS probe_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'leased', 'completed', 'expired')),
  leased_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_job_per_check
  ON probe_jobs(check_id) WHERE state IN ('queued', 'leased');

CREATE TABLE IF NOT EXISTS probe_results (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL UNIQUE REFERENCES probe_jobs(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('up', 'down', 'degraded', 'unknown')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  latency_ms double precision,
  message text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  observations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS probe_results_check_created_idx ON probe_results(check_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  opening_result_id bigint REFERENCES probe_results(id),
  closing_result_id bigint REFERENCES probe_results(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident_per_check
  ON incidents(check_id) WHERE status = 'open';

INSERT INTO devices (id, name, address, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'HedgeSight Application', 'app', 'Built-in platform health check')
ON CONFLICT (id) DO NOTHING;

INSERT INTO checks (id, device_id, name, kind, interval_seconds, timeout_ms, config)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Application API',
  'http',
  30,
  5000,
  '{"url":"http://app:8080/api/health","expectedStatus":200}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
