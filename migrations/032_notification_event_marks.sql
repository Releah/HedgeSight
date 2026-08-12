CREATE TABLE notification_event_marks (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  event_kind text NOT NULL,
  emitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(entity_type,entity_id,event_kind)
);
