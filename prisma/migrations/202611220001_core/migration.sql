-- Reviewed project migration from DOC-15 and the illustrative core schema.
-- Proposed PostgreSQL 17 core design. Create only in a new, isolated scratch database.
-- Unqualified names are local to the caller's scratch search_path. No seed or production data.
CREATE TABLE org_unit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code text NOT NULL UNIQUE,
 kind text NOT NULL CHECK (kind IN ('institution','faculty','department')), parent_id bigint REFERENCES org_unit
);
CREATE TABLE identity_account (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, issuer text NOT NULL, subject text NOT NULL, UNIQUE(issuer,subject)
);
CREATE TABLE term (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code text UNIQUE NOT NULL, zone text NOT NULL,
 opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, epoch bigint NOT NULL DEFAULT 0, CHECK(opens_at<closes_at)
);
CREATE TABLE role_assignment (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id bigint NOT NULL REFERENCES identity_account,
 role_code text NOT NULL, unit_id bigint NOT NULL REFERENCES org_unit, term_id bigint REFERENCES term,
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, CHECK(valid_from<valid_until)
);
CREATE INDEX role_scope ON role_assignment(actor_id,unit_id,role_code);
CREATE TABLE program (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, unit_id bigint NOT NULL REFERENCES org_unit, code text UNIQUE NOT NULL, degree_level text NOT NULL
);
CREATE TABLE curriculum_version (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, program_id bigint NOT NULL REFERENCES program, edition text NOT NULL,
 effective_from date NOT NULL, requirements jsonb NOT NULL, UNIQUE(program_id,edition), UNIQUE(id,program_id)
);
CREATE TABLE student_program (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL REFERENCES identity_account,
 program_id bigint NOT NULL REFERENCES program, curriculum_id bigint NOT NULL, specialization text, admitted_on date NOT NULL,
 FOREIGN KEY(curriculum_id,program_id) REFERENCES curriculum_version(id,program_id)
);
CREATE TABLE course (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code text NOT NULL UNIQUE, title text NOT NULL, credits numeric(6,2) NOT NULL CHECK(credits>=0)
);
CREATE TABLE curriculum_course (
 curriculum_id bigint REFERENCES curriculum_version, course_id bigint REFERENCES course,
 classification text NOT NULL CHECK(classification IN ('general','foundational','core','specialized','elective')),
 requirement_group text NOT NULL, PRIMARY KEY(curriculum_id,course_id,requirement_group)
);
CREATE TABLE academic_record (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL REFERENCES identity_account, course_id bigint NOT NULL REFERENCES course,
 attempt_key text NOT NULL, revision integer NOT NULL CHECK(revision>0), outcome text NOT NULL CHECK(outcome IN ('in_progress','passed','failed','withdrawn')),
 grade numeric(7,3), earned_credits numeric(6,2) NOT NULL CHECK(earned_credits>=0), supersedes bigint UNIQUE REFERENCES academic_record,
 UNIQUE(student_id,attempt_key,revision)
);
CREATE TABLE equivalency (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_course bigint NOT NULL REFERENCES course, target_course bigint NOT NULL REFERENCES course,
 curriculum_id bigint NOT NULL REFERENCES curriculum_version, valid_from date NOT NULL, valid_until date, approval_ref text NOT NULL,
 CHECK(source_course<>target_course AND (valid_until IS NULL OR valid_from<valid_until))
);
CREATE TABLE policy_version (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, unit_id bigint NOT NULL REFERENCES org_unit, edition text NOT NULL,
 state text NOT NULL CHECK(state IN ('draft','approved','retired')), parameters jsonb NOT NULL, UNIQUE(unit_id,edition)
);
CREATE TABLE academic_rule (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, policy_id bigint NOT NULL REFERENCES policy_version, rule_code text NOT NULL,
 stage text NOT NULL, expression jsonb NOT NULL, UNIQUE(policy_id,rule_code)
);
CREATE TABLE student_term (
 student_id bigint REFERENCES identity_account, term_id bigint REFERENCES term, student_program_id bigint NOT NULL REFERENCES student_program,
 policy_id bigint NOT NULL REFERENCES policy_version, epoch bigint NOT NULL DEFAULT 0, PRIMARY KEY(student_id,term_id)
);
CREATE TABLE appointment (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, term_id bigint NOT NULL,
 opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL, FOREIGN KEY(student_id,term_id) REFERENCES student_term,
 CHECK(opens_at<closes_at)
);
CREATE TABLE instructor (
 id bigint PRIMARY KEY REFERENCES identity_account, unit_id bigint NOT NULL REFERENCES org_unit, workload_limit numeric(8,2) NOT NULL CHECK(workload_limit>=0)
);
CREATE TABLE qualification (
 instructor_id bigint REFERENCES instructor, course_id bigint REFERENCES course, valid_from date NOT NULL, valid_until date,
 PRIMARY KEY(instructor_id,course_id,valid_from), CHECK(valid_until IS NULL OR valid_from<valid_until)
);
CREATE TABLE availability (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, instructor_id bigint NOT NULL REFERENCES instructor, term_id bigint NOT NULL REFERENCES term,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, CHECK(starts_at<ends_at)
);
CREATE TABLE room (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, code text UNIQUE NOT NULL, campus text NOT NULL, capacity integer NOT NULL CHECK(capacity>=0)
);
CREATE TABLE room_feature (
 room_id bigint REFERENCES room, feature text, PRIMARY KEY(room_id,feature)
);
CREATE TABLE offering (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, course_id bigint NOT NULL REFERENCES course,
 term_id bigint NOT NULL REFERENCES term, unit_id bigint NOT NULL REFERENCES org_unit, credit_value numeric(6,2) NOT NULL CHECK(credit_value>=0)
);
CREATE TABLE capacity_pool (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, term_id bigint NOT NULL REFERENCES term, capacity integer NOT NULL CHECK(capacity>=0)
);
CREATE TABLE section (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, offering_id bigint NOT NULL REFERENCES offering, code text NOT NULL,
 pool_id bigint NOT NULL REFERENCES capacity_pool, UNIQUE(offering_id,code)
);
CREATE TABLE component (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, section_id bigint NOT NULL REFERENCES section, kind text NOT NULL,
 pool_id bigint NOT NULL REFERENCES capacity_pool, required_pattern text NOT NULL, contact_minutes integer NOT NULL CHECK(contact_minutes>0)
);
CREATE TABLE reservation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, pool_id bigint NOT NULL REFERENCES capacity_pool, eligibility_group text NOT NULL,
 seats integer NOT NULL CHECK(seats>=0), release_at timestamptz NOT NULL, UNIQUE(pool_id,eligibility_group)
);
CREATE TABLE timetable_version (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, term_id bigint NOT NULL REFERENCES term,
 based_on bigint REFERENCES timetable_version, state text NOT NULL CHECK(state IN ('draft','proposed','validated','published','superseded')),
 input_epoch bigint NOT NULL, content_hash text NOT NULL, validator_ref text, proposer_id bigint NOT NULL REFERENCES identity_account
);
CREATE UNIQUE INDEX one_published ON timetable_version(term_id) WHERE state='published';
CREATE TABLE meeting (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_id bigint NOT NULL REFERENCES timetable_version, component_id bigint NOT NULL REFERENCES component,
 instructor_id bigint NOT NULL REFERENCES instructor, room_id bigint NOT NULL REFERENCES room, local_day smallint NOT NULL CHECK(local_day BETWEEN 1 AND 7),
 local_start time NOT NULL, duration_minutes integer NOT NULL CHECK(duration_minutes>0), week_dates date[] NOT NULL, zone text NOT NULL, exception_dates jsonb NOT NULL
);
CREATE TABLE enrollment (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, term_id bigint NOT NULL, offering_id bigint NOT NULL REFERENCES offering,
 section_id bigint NOT NULL REFERENCES section, course_id bigint NOT NULL REFERENCES course, credit_value numeric(6,2) NOT NULL CHECK(credit_value>=0),
 state text NOT NULL CHECK(state IN ('active','dropped')), FOREIGN KEY(student_id,term_id) REFERENCES student_term
);
CREATE UNIQUE INDEX one_active_course ON enrollment(student_id,term_id,course_id) WHERE state='active';
CREATE TABLE enrollment_component (
 enrollment_id bigint REFERENCES enrollment, component_id bigint REFERENCES component, PRIMARY KEY(enrollment_id,component_id)
);
CREATE TABLE waitlist (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, term_id bigint NOT NULL, pool_id bigint NOT NULL REFERENCES capacity_pool,
 bundle jsonb NOT NULL, tier integer NOT NULL, joined_at timestamptz NOT NULL, expires_at timestamptz,
 state text NOT NULL CHECK(state IN ('queued','offered','enrolled','declined','expired','ineligible')),
 FOREIGN KEY(student_id,term_id) REFERENCES student_term
);
CREATE UNIQUE INDEX one_live_entry ON waitlist(student_id,pool_id) WHERE state IN ('queued','offered');
CREATE INDEX queue_order ON waitlist(pool_id,tier,joined_at,id) WHERE state='queued';
CREATE TABLE seat_claim (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, pool_id bigint NOT NULL REFERENCES capacity_pool, reservation_id bigint REFERENCES reservation,
 enrollment_id bigint REFERENCES enrollment, waitlist_id bigint REFERENCES waitlist, CHECK(num_nonnulls(enrollment_id,waitlist_id)=1),
 UNIQUE(pool_id,enrollment_id), UNIQUE(pool_id,waitlist_id)
);
CREATE INDEX pool_claims ON seat_claim(pool_id,reservation_id);
CREATE TABLE exception_grant (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, term_id bigint NOT NULL, rule_code text NOT NULL, policy_id bigint NOT NULL REFERENCES policy_version,
 requestor bigint NOT NULL REFERENCES identity_account, approver bigint REFERENCES identity_account, reason_ref text NOT NULL, valid_until timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('requested','approved','rejected','revoked')), FOREIGN KEY(student_id,term_id) REFERENCES student_term,
 CHECK(requestor<>approver), CHECK(state<>'approved' OR approver IS NOT NULL)
);
CREATE TABLE solve_job (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, term_id bigint NOT NULL REFERENCES term, snapshot_hash text NOT NULL, input_uri text NOT NULL,
 solver_version text NOT NULL, config jsonb NOT NULL, state text NOT NULL CHECK(state IN ('queued','running','finished','failed')),
 result_uri text, lease_until timestamptz, generation bigint NOT NULL DEFAULT 0
);
CREATE TABLE idempotency_record (
 actor_id bigint REFERENCES identity_account, operation text, request_key text, subject_id bigint NOT NULL REFERENCES identity_account,
 term_id bigint NOT NULL REFERENCES term, payload_hash text NOT NULL, state text NOT NULL CHECK(state IN ('processing','finished')),
 http_status integer, outcome jsonb, expires_at timestamptz NOT NULL, PRIMARY KEY(actor_id,operation,request_key)
);
CREATE TABLE audit_entry (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id bigint NOT NULL REFERENCES identity_account, subject_id bigint REFERENCES identity_account,
 term_id bigint REFERENCES term, action text NOT NULL, decision_ref text NOT NULL, request_id text NOT NULL, occurred_at timestamptz NOT NULL
);
CREATE TABLE outbox_event (
 id uuid PRIMARY KEY, aggregate_key text NOT NULL, sequence bigint NOT NULL, event_type text NOT NULL, envelope jsonb NOT NULL,
 occurred_at timestamptz NOT NULL, published_at timestamptz, UNIQUE(aggregate_key,sequence)
);
CREATE INDEX outbox_pending ON outbox_event(occurred_at,id) WHERE published_at IS NULL;
CREATE TABLE consumer_receipt (
 consumer text, event_id uuid, processed_at timestamptz NOT NULL, PRIMARY KEY(consumer,event_id)
);

-- Operational coordination and auditable validation evidence.
ALTER TABLE student_term ADD COLUMN registration_stage text NOT NULL DEFAULT 'draft'
 CHECK(registration_stage IN ('draft','finalized')), ADD COLUMN finalization_ref text;
CREATE TABLE queue_guard (term_id bigint PRIMARY KEY REFERENCES term);
CREATE TABLE validation_record (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_id bigint NOT NULL REFERENCES timetable_version,
 content_hash text NOT NULL, checked_epoch bigint NOT NULL, validator_build text NOT NULL, passed boolean NOT NULL,
 conflict_report jsonb NOT NULL, checked_at timestamptz NOT NULL
);
CREATE TABLE review_case (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_id bigint NOT NULL, term_id bigint NOT NULL,
 trigger_event uuid NOT NULL, reason text NOT NULL, state text NOT NULL CHECK(state IN ('open','resolved')),
 resolution_ref text, UNIQUE(student_id,term_id,trigger_event), FOREIGN KEY(student_id,term_id) REFERENCES student_term
);

ALTER TABLE course ADD COLUMN canonical_course_id bigint REFERENCES course;
ALTER TABLE offering ADD COLUMN search_title text;
ALTER TABLE enrollment ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE student_term ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE student_term ADD COLUMN standing text, ADD COLUMN gpa numeric(7,3);
ALTER TABLE academic_rule ADD COLUMN target_course_id bigint REFERENCES course;
ALTER TABLE academic_rule ADD COLUMN waivable boolean NOT NULL DEFAULT false;
ALTER TABLE academic_rule ADD CONSTRAINT valid_stage CHECK (stage IN ('registration','finalization'));
ALTER TABLE waitlist ADD COLUMN reason_code text;
ALTER TABLE waitlist ADD COLUMN pool_ids bigint[] NOT NULL DEFAULT '{}';
CREATE INDEX overlapping_waitlist ON waitlist USING gin(pool_ids);
CREATE TABLE operation_window (
  term_id bigint NOT NULL REFERENCES term, operation text NOT NULL,
  opens_at timestamptz NOT NULL, closes_at timestamptz NOT NULL,
  PRIMARY KEY(term_id,operation), CHECK(opens_at < closes_at)
);
CREATE TABLE section_bundle (
  section_id bigint NOT NULL REFERENCES section, component_ids bigint[] NOT NULL,
  PRIMARY KEY(section_id,component_ids), CHECK(cardinality(component_ids)>0)
);
CREATE TABLE web_session (
  token_hash text PRIMARY KEY, csrf_hash text NOT NULL, actor_id bigint NOT NULL REFERENCES identity_account,
  expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE development_credential (
  actor_id bigint PRIMARY KEY REFERENCES identity_account, login text NOT NULL UNIQUE, password_hash text NOT NULL
);
CREATE TABLE case_delegation (
  case_ref text PRIMARY KEY, actor_id bigint NOT NULL REFERENCES identity_account,
  student_id bigint NOT NULL REFERENCES identity_account, term_id bigint NOT NULL REFERENCES term,
  valid_until timestamptz NOT NULL
);
ALTER TABLE idempotency_record ADD COLUMN case_ref text;
CREATE TABLE solve_snapshot (
  id text PRIMARY KEY, term_id bigint NOT NULL REFERENCES term, epoch bigint NOT NULL,
  input jsonb NOT NULL, created_by bigint NOT NULL REFERENCES identity_account
);
ALTER TABLE solve_job ADD COLUMN result jsonb, ADD COLUMN error_code text;
ALTER TABLE solve_job ADD COLUMN created_by bigint REFERENCES identity_account;
ALTER TABLE timetable_version ADD COLUMN snapshot_id text REFERENCES solve_snapshot, ADD COLUMN assignments jsonb;
CREATE TABLE notification_intent (
  event_id uuid PRIMARY KEY REFERENCES outbox_event, state text NOT NULL CHECK (state IN ('unconfigured','pending','sent','review')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE quarantine_event (
  event_id uuid PRIMARY KEY REFERENCES outbox_event, reason text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
