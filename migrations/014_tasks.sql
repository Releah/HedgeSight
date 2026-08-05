CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),
  status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','in_progress','testing','completed')),
  assignee_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE task_incidents (task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,linked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,incident_id));
CREATE TABLE task_updates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE SET NULL,body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX tasks_status_idx ON tasks(status,updated_at DESC);
CREATE INDEX task_updates_task_idx ON task_updates(task_id,created_at);
