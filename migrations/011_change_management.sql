CREATE TABLE change_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_reference text NOT NULL,
  change_manager_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(change_reference)) BETWEEN 1 AND 200)
);

CREATE TABLE change_record_devices (
  change_record_id uuid NOT NULL REFERENCES change_records(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  ended_at timestamptz,
  PRIMARY KEY (change_record_id, device_id)
);

CREATE UNIQUE INDEX one_active_change_per_device
  ON change_record_devices(device_id)
  WHERE ended_at IS NULL;

CREATE INDEX change_records_active_idx ON change_records(ended_at,started_at DESC);
