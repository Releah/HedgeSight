CREATE TABLE IF NOT EXISTS incident_change_notifications (
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  change_record_id uuid NOT NULL REFERENCES change_records(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, change_record_id)
);
