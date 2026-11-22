ALTER TABLE notification_intent ADD COLUMN attempt integer NOT NULL DEFAULT 0;
ALTER TABLE notification_intent ADD COLUMN lease_until timestamptz;
ALTER TABLE notification_intent ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE notification_intent ADD COLUMN sent_at timestamptz;
ALTER TABLE notification_intent ADD COLUMN provider_receipt text;
ALTER TABLE notification_intent ADD COLUMN last_failure text;
CREATE INDEX notification_dispatch ON notification_intent(state, next_attempt_at) WHERE state='pending';

CREATE TABLE worker_heartbeat (
  name text PRIMARY KEY,
  updated_at timestamptz NOT NULL,
  queue_waiting integer NOT NULL,
  outbox_pending integer NOT NULL,
  oldest_outbox_seconds integer NOT NULL,
  notification_reviews integer NOT NULL
);
