CREATE TABLE IF NOT EXISTS credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  username text NOT NULL,
  password_encrypted bytea NOT NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_ssh_credentials (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  port integer NOT NULL DEFAULT 22 CHECK (port BETWEEN 1 AND 65535),
  host_key_fingerprint text,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_profiled_at timestamptz;
