-- Unify operational workflows with alert delivery without changing application roles.
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_trigger_kind_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_trigger_kind_check CHECK(trigger_kind IN (
  'check_down','check_degraded','check_recovered',
  'incident_created','incident_resolved','major_incident_created','major_incident_resolved',
  'maintenance_created','maintenance_started','maintenance_ended','maintenance_overrun',
  'task_created','task_assigned','task_completed'
));

CREATE TABLE notification_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_group_users (
  group_id uuid NOT NULL REFERENCES notification_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,user_id)
);

CREATE TABLE notification_group_channels (
  group_id uuid NOT NULL REFERENCES notification_groups(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,channel_id)
);

ALTER TABLE alert_rules ADD COLUMN audience_group_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE alert_occurrences ADD COLUMN entity_type text;
ALTER TABLE alert_occurrences ADD COLUMN entity_id uuid;
CREATE INDEX alert_occurrences_entity_idx ON alert_occurrences(entity_type,entity_id,created_at DESC);
