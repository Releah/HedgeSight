ALTER TABLE devices ADD COLUMN IF NOT EXISTS os_name text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS os_version text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS profile_source text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS profiled_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS one_ping_check_per_device ON checks(device_id) WHERE kind = 'ping';

INSERT INTO checks(device_id, name, kind, interval_seconds, timeout_ms, config)
SELECT d.id, 'Ping availability', 'ping', 60, 5000, '{}'::jsonb
FROM devices d
WHERE d.id <> '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM checks c WHERE c.device_id=d.id AND c.kind='ping')
ON CONFLICT DO NOTHING;
