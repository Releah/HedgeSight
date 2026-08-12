CREATE TABLE alert_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  position integer NOT NULL DEFAULT 0,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK(kind IN ('discord','teams','webhook')),
  endpoint_encrypted bytea NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES alert_folders(id) ON DELETE SET NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  trigger_kind text NOT NULL CHECK(trigger_kind IN ('check_down','check_degraded','check_recovered')),
  severity text NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
  conditions jsonb NOT NULL DEFAULT '{}',
  channel_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  muted_until timestamptz,
  cooldown_seconds integer NOT NULL DEFAULT 300 CHECK(cooldown_seconds BETWEEN 0 AND 604800),
  notify_recovery boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name text NOT NULL,
  trigger_kind text NOT NULL,
  severity text NOT NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  check_id uuid REFERENCES checks(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES alert_occurrences(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES alert_channels(id) ON DELETE SET NULL,
  channel_name text NOT NULL,
  channel_kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  response_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alert_rules_folder_idx ON alert_rules(folder_id);
CREATE INDEX alert_occurrences_created_idx ON alert_occurrences(created_at DESC);
CREATE INDEX alert_deliveries_queue_idx ON alert_deliveries(status,next_attempt_at);
