CREATE TABLE timetable_impact_review (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES timetable_version(id),
  validation_id bigint NOT NULL REFERENCES validation_record(id),
  previous_version_id bigint REFERENCES timetable_version(id),
  content_hash text NOT NULL,
  impact_hash text NOT NULL,
  reviewer_id bigint NOT NULL REFERENCES identity_account(id),
  approval_ref text NOT NULL CHECK (length(approval_ref) BETWEEN 1 AND 120),
  affected_students integer NOT NULL CHECK (affected_students > 0),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (version_id, validation_id, impact_hash)
);

CREATE TABLE timetable_change_notice (
  version_id bigint NOT NULL REFERENCES timetable_version(id),
  student_id bigint NOT NULL REFERENCES identity_account(id),
  term_id bigint NOT NULL REFERENCES term(id),
  changed_components integer NOT NULL CHECK (changed_components > 0),
  published_at timestamptz NOT NULL,
  PRIMARY KEY (version_id, student_id)
);
CREATE INDEX timetable_notice_student ON timetable_change_notice (student_id, term_id, published_at DESC);
