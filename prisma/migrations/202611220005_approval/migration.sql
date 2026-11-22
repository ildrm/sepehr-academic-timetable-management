CREATE TABLE policy_author (
  policy_id bigint PRIMARY KEY REFERENCES policy_version,
  actor_id bigint NOT NULL REFERENCES identity_account
);
CREATE TABLE curriculum_review (
  curriculum_id bigint PRIMARY KEY REFERENCES curriculum_version,
  author_id bigint NOT NULL REFERENCES identity_account,
  approved_by bigint REFERENCES identity_account,
  state text NOT NULL CHECK(state IN ('draft','approved')),
  CHECK(author_id<>approved_by),
  CHECK(state<>'approved' OR approved_by IS NOT NULL)
);
