CREATE TABLE term_scope (
  term_id bigint PRIMARY KEY REFERENCES term,
  unit_id bigint NOT NULL REFERENCES org_unit
);
CREATE INDEX enrollment_term_scope ON enrollment(term_id,student_id) WHERE state='active';
CREATE INDEX idempotency_expiry ON idempotency_record(expires_at);
