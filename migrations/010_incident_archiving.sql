ALTER TABLE incidents ADD COLUMN archived_at timestamptz;
ALTER TABLE incidents ADD COLUMN archived_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
UPDATE incidents SET archived_at=COALESCE(resolved_at,now()) WHERE status='resolved';
CREATE INDEX incidents_archive_idx ON incidents(archived_at,opened_at DESC);
