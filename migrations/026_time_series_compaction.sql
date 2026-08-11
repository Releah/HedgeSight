CREATE TABLE IF NOT EXISTS probe_result_rollups (
  bucket_at timestamptz NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('5m','1h','1d')),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  samples integer NOT NULL,
  up_samples integer NOT NULL,
  down_samples integer NOT NULL,
  degraded_samples integer NOT NULL,
  unknown_samples integer NOT NULL,
  availability_percent double precision,
  latency_avg_ms double precision,
  latency_min_ms double precision,
  latency_max_ms double precision,
  latency_p95_ms double precision,
  first_sample_at timestamptz NOT NULL,
  last_sample_at timestamptz NOT NULL,
  PRIMARY KEY (resolution,bucket_at,check_id)
);
CREATE INDEX IF NOT EXISTS probe_result_rollups_check_idx ON probe_result_rollups(check_id,resolution,bucket_at DESC);
CREATE INDEX IF NOT EXISTS probe_result_rollups_device_idx ON probe_result_rollups(device_id,resolution,bucket_at DESC);

CREATE TABLE IF NOT EXISTS metric_rollups (
  bucket_at timestamptz NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('5m','1h','1d')),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  check_id uuid REFERENCES checks(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  unit text,
  samples integer NOT NULL,
  value_avg double precision NOT NULL,
  value_min double precision NOT NULL,
  value_max double precision NOT NULL,
  value_p95 double precision NOT NULL,
  PRIMARY KEY (resolution,bucket_at,device_id,metric_key)
);
CREATE INDEX IF NOT EXISTS metric_rollups_lookup_idx ON metric_rollups(device_id,metric_key,resolution,bucket_at DESC);

