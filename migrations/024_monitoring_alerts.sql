ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_status_check;
ALTER TABLE devices ADD CONSTRAINT devices_status_check CHECK (status IN ('up','down','degraded','monitoring_error','unknown'));

CREATE TABLE monitoring_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('degraded','monitoring_unavailable')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','cleared','dismissed','incident','task')),
  message text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  linked_incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  linked_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX one_open_monitoring_alert ON monitoring_alerts(check_id,kind) WHERE state='open';
CREATE INDEX monitoring_alerts_state_idx ON monitoring_alerts(state,last_seen_at DESC);

UPDATE incidents i SET recovered_at=COALESCE(i.recovered_at,now()),status='pending_investigation',last_activity_at=now()
WHERE i.status<>'resolved' AND EXISTS (
  SELECT 1 FROM checks source JOIN checks primary_check ON primary_check.device_id=source.device_id AND primary_check.kind='ping'
  WHERE source.id=i.check_id AND source.kind<>'ping' AND primary_check.last_status='up'
);
UPDATE incident_signals s SET recovered_at=COALESCE(s.recovered_at,now())
WHERE recovered_at IS NULL AND EXISTS (SELECT 1 FROM incidents i WHERE i.id=s.incident_id AND i.recovered_at IS NOT NULL);
