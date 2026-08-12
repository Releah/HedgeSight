ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS message_template text NOT NULL
  DEFAULT '$SEVERITY: $NODE changed to $STATUS at $TIME. $MESSAGE';
