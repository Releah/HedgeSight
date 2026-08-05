CREATE TABLE IF NOT EXISTS retention_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  raw_days integer NOT NULL DEFAULT 30 CHECK (raw_days BETWEEN 1 AND 3650),
  five_minute_days integer NOT NULL DEFAULT 90 CHECK (five_minute_days BETWEEN 1 AND 3650),
  hourly_days integer NOT NULL DEFAULT 365 CHECK (hourly_days BETWEEN 1 AND 7300),
  daily_days integer NOT NULL DEFAULT 1825 CHECK (daily_days BETWEEN 1 AND 36500),
  incident_days integer NOT NULL DEFAULT 730 CHECK (incident_days BETWEEN 1 AND 36500),
  configuration_days integer NOT NULL DEFAULT 365 CHECK (configuration_days BETWEEN 1 AND 36500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO retention_settings(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS device_retention_overrides (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  raw_days integer CHECK (raw_days BETWEEN 1 AND 3650),
  five_minute_days integer CHECK (five_minute_days BETWEEN 1 AND 3650),
  hourly_days integer CHECK (hourly_days BETWEEN 1 AND 7300),
  daily_days integer CHECK (daily_days BETWEEN 1 AND 36500),
  incident_days integer CHECK (incident_days BETWEEN 1 AND 36500),
  configuration_days integer CHECK (configuration_days BETWEEN 1 AND 36500),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  snmp_index integer,
  name text NOT NULL,
  alias text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  mac_address text,
  interface_type integer,
  speed_bps bigint,
  admin_status smallint,
  operational_status smallint,
  present boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(device_id, stable_key)
);

CREATE INDEX IF NOT EXISTS interfaces_device_idx ON interfaces(device_id, present, name);

CREATE TABLE IF NOT EXISTS interface_samples (
  collected_at timestamptz NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  interface_id uuid NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  device_uptime_ticks bigint,
  in_octets numeric(20,0),
  out_octets numeric(20,0),
  in_unicast_packets numeric(20,0),
  out_unicast_packets numeric(20,0),
  in_errors numeric(20,0),
  out_errors numeric(20,0),
  in_discards numeric(20,0),
  out_discards numeric(20,0),
  in_bps double precision,
  out_bps double precision,
  utilization_in_percent double precision,
  utilization_out_percent double precision,
  admin_status smallint,
  operational_status smallint,
  counter_reset boolean NOT NULL DEFAULT false,
  PRIMARY KEY (collected_at, interface_id)
) PARTITION BY RANGE (collected_at);

CREATE TABLE IF NOT EXISTS interface_samples_default PARTITION OF interface_samples DEFAULT;
CREATE INDEX IF NOT EXISTS interface_samples_default_lookup_idx ON interface_samples_default(interface_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS interface_samples_default_device_idx ON interface_samples_default(device_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS interface_rollups (
  bucket_at timestamptz NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('5m', '1h', '1d')),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  interface_id uuid NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  samples integer NOT NULL,
  in_bps_avg double precision,
  in_bps_max double precision,
  out_bps_avg double precision,
  out_bps_max double precision,
  utilization_in_avg double precision,
  utilization_in_max double precision,
  utilization_out_avg double precision,
  utilization_out_max double precision,
  in_errors_delta numeric(20,0),
  out_errors_delta numeric(20,0),
  in_discards_delta numeric(20,0),
  out_discards_delta numeric(20,0),
  PRIMARY KEY (resolution, bucket_at, interface_id)
);

CREATE INDEX IF NOT EXISTS interface_rollups_lookup_idx ON interface_rollups(interface_id, resolution, bucket_at DESC);
CREATE INDEX IF NOT EXISTS interface_rollups_device_idx ON interface_rollups(device_id, resolution, bucket_at DESC);

CREATE TABLE IF NOT EXISTS metric_samples (
  collected_at timestamptz NOT NULL,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  check_id uuid REFERENCES checks(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  value double precision NOT NULL,
  unit text,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (collected_at, device_id, metric_key)
) PARTITION BY RANGE (collected_at);

CREATE TABLE IF NOT EXISTS metric_samples_default PARTITION OF metric_samples DEFAULT;
CREATE INDEX IF NOT EXISTS metric_samples_default_lookup_idx ON metric_samples_default(device_id, metric_key, collected_at DESC);

CREATE TABLE IF NOT EXISTS configuration_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  collected_at timestamptz NOT NULL DEFAULT now(),
  config_type text NOT NULL DEFAULT 'running',
  content_hash text NOT NULL,
  encrypted_content bytea NOT NULL,
  size_bytes integer NOT NULL,
  collection_status text NOT NULL DEFAULT 'success' CHECK (collection_status IN ('success', 'failed')),
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  previous_snapshot_id uuid REFERENCES configuration_snapshots(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(device_id, config_type, content_hash)
);

CREATE INDEX IF NOT EXISTS configuration_snapshots_device_idx ON configuration_snapshots(device_id, config_type, collected_at DESC);

CREATE TABLE IF NOT EXISTS storage_maintenance_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  rollups_written integer NOT NULL DEFAULT 0,
  rows_deleted integer NOT NULL DEFAULT 0,
  message text
);
