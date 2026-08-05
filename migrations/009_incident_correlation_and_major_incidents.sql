ALTER TABLE incidents ADD COLUMN device_id uuid REFERENCES devices(id) ON DELETE CASCADE;
UPDATE incidents i SET device_id=c.device_id FROM checks c WHERE c.id=i.check_id;
ALTER TABLE incidents ALTER COLUMN device_id SET NOT NULL;
ALTER TABLE incidents ADD COLUMN recurrence_count integer NOT NULL DEFAULT 1;
ALTER TABLE incidents ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
DROP INDEX IF EXISTS one_active_incident_per_check;
CREATE UNIQUE INDEX one_active_incident_per_device ON incidents(device_id)
  WHERE status IN ('open','pending_investigation','under_investigation');

CREATE TABLE incident_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  opening_result_id bigint REFERENCES probe_results(id),
  closing_result_id bigint REFERENCES probe_results(id)
);
CREATE UNIQUE INDEX one_active_signal_per_check ON incident_signals(check_id) WHERE recovered_at IS NULL;
INSERT INTO incident_signals(incident_id,check_id,opened_at,recovered_at,opening_result_id,closing_result_id)
SELECT id,check_id,opened_at,recovered_at,opening_result_id,closing_result_id FROM incidents;

CREATE TABLE major_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  title text NOT NULL,
  impact text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'major' CHECK (severity IN ('major','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE major_incident_members (
  major_incident_id uuid NOT NULL REFERENCES major_incidents(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(major_incident_id,incident_id)
);
CREATE TABLE major_incident_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  major_incident_id uuid NOT NULL REFERENCES major_incidents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
