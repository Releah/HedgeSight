ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('open','pending_investigation','under_investigation','resolved'));
ALTER TABLE incidents ADD COLUMN recovered_at timestamptz;
ALTER TABLE incidents ADD COLUMN investigating_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN closed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS one_open_incident_per_check;
CREATE UNIQUE INDEX one_active_incident_per_check ON incidents(check_id)
  WHERE status IN ('open','pending_investigation','under_investigation');

CREATE TABLE incident_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_updates_incident_created_idx ON incident_updates(incident_id,created_at);

UPDATE incidents i SET recovered_at=COALESCE(i.resolved_at,pr.finished_at)
FROM probe_results pr WHERE pr.id=i.closing_result_id AND i.status='resolved';
UPDATE incidents i SET status='pending_investigation',recovered_at=COALESCE(i.recovered_at,c.last_run_at)
FROM checks c WHERE c.id=i.check_id AND i.status='open' AND c.last_status='up';
