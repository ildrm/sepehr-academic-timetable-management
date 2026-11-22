CREATE TABLE allocation_campaign (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term_id bigint NOT NULL REFERENCES term(id),
  created_by bigint NOT NULL REFERENCES identity_account(id),
  approved_by bigint REFERENCES identity_account(id),
  policy_ref text NOT NULL CHECK (length(policy_ref) BETWEEN 1 AND 120),
  approval_ref text CHECK (length(approval_ref) BETWEEN 1 AND 120),
  seed_commitment text NOT NULL CHECK (seed_commitment ~ '^[a-f0-9]{64}$'),
  required_classifications text[] NOT NULL CHECK (cardinality(required_classifications) > 0),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  applicant_limit integer NOT NULL CHECK (applicant_limit BETWEEN 1 AND 64),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','open','sealed','published')),
  CHECK (opens_at < closes_at),
  CHECK (approved_by IS NULL OR approved_by <> created_by),
  CHECK (state='draft' OR approved_by IS NOT NULL AND approval_ref IS NOT NULL)
);

CREATE TABLE allocation_application (
  id uuid PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES allocation_campaign(id),
  student_id bigint NOT NULL REFERENCES identity_account(id),
  alternatives jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (campaign_id, student_id)
);

CREATE TABLE allocation_run (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES allocation_campaign(id),
  requested_by bigint NOT NULL REFERENCES identity_account(id),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','ready','failed','published','stale')),
  input jsonb NOT NULL,
  revision_hash text NOT NULL,
  seed text NOT NULL,
  result jsonb,
  lease_until timestamptz,
  attempt integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz,
  published_by bigint REFERENCES identity_account(id),
  publication_ref text
);
CREATE INDEX allocation_run_dispatch ON allocation_run(state, lease_until, id);
CREATE UNIQUE INDEX allocation_campaign_live_run ON allocation_run(campaign_id) WHERE state IN ('queued','running','ready');
