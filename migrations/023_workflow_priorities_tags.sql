ALTER TABLE tasks ADD COLUMN priority text NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1','P2','P3','P4'));
ALTER TABLE incidents ADD COLUMN priority text NOT NULL DEFAULT 'P3' CHECK (priority IN ('P1','P2','P3','P4'));
ALTER TABLE major_incidents ADD COLUMN archived_at timestamptz;
ALTER TABLE major_incidents ADD COLUMN archived_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE task_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40),
  color text NOT NULL DEFAULT '#41d69b' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_tag_links (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,tag_id)
);
CREATE INDEX incidents_priority_idx ON incidents(priority,status,opened_at DESC);
