ALTER TABLE change_records ADD COLUMN estimated_end_at timestamptz;
UPDATE change_records SET estimated_end_at=started_at+interval '4 hours';
ALTER TABLE change_records ALTER COLUMN estimated_end_at SET NOT NULL;
ALTER TABLE change_records ADD CONSTRAINT change_window_order CHECK (estimated_end_at>started_at);
CREATE INDEX change_records_schedule_idx ON change_records(started_at,estimated_end_at) WHERE ended_at IS NULL;
