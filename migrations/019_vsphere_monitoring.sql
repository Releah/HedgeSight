ALTER TABLE checks DROP CONSTRAINT IF EXISTS checks_kind_check;
ALTER TABLE checks ADD CONSTRAINT checks_kind_check CHECK (kind IN ('ping','http','snmp','ssh','vsphere'));

CREATE TABLE IF NOT EXISTS device_vsphere_credentials (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  port integer NOT NULL DEFAULT 443 CHECK (port BETWEEN 1 AND 65535),
  verify_tls boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS vsphere_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS vsphere_profiled_at timestamptz;
