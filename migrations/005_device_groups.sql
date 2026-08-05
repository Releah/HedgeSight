CREATE TABLE IF NOT EXISTS device_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#41d69b',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS device_group_memberships (
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, group_id)
);

CREATE INDEX IF NOT EXISTS device_group_memberships_group_idx ON device_group_memberships(group_id, device_id);
