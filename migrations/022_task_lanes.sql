ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
CREATE TABLE task_lanes (key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,40}$'),name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),position integer NOT NULL,is_completion_lane boolean NOT NULL DEFAULT false);
INSERT INTO task_lanes(key,name,position,is_completion_lane) VALUES ('backlog','Backlog',10,false),('in_progress','In progress',20,false),('testing','Testing',30,false),('completed','Completed',40,true) ON CONFLICT(key) DO NOTHING;
