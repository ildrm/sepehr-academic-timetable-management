CREATE TABLE import_batch (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id bigint NOT NULL REFERENCES identity_account, term_id bigint NOT NULL REFERENCES term,
  source_ref text NOT NULL, payload_hash text NOT NULL, inserted integer NOT NULL CHECK(inserted>=0),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(actor_id,term_id,source_ref)
);
