# Test and verification strategy

DOC-21 · Version 0.1 · proposed · Owner: Quality lead

**Purpose and scope** — Design reproducible tests for academic and operational invariants.

**Audience** — Testers and release reviewers.

**Dependencies** — [Enrollment and waitlists](09-enrollment-waitlist.md), [Timetabling optimization](10-timetabling-optimization.md), [Registration transactions](17-transactions-consistency.md), [Performance and capacity](20-nfr-performance-capacity.md).

## Verification layers
Unit-test each rule operator against versioned facts, missing evidence and approved exceptions. Property tests generate command histories with independent keys and randomized scheduling, then shrink a failing sequence. Check pool occupancy including offer holds, active uniqueness and valid component combinations after every committed transition. Use separate real PostgreSQL connections and barriers to force overlapping student-term, pool and idempotency writes. Mocks can verify pure decisions only.
Contract tests validate payloads, failure envelopes, CSRF and status retrieval. End-to-end tests follow Persian keyboard flows through search, preview, commit, refresh and session expiry. Security tests cover same-actor dual roles, scoped report downloads and temporary assignment expiration. Run independent timetable validation over hand-crafted invalid placements and manual edits. Operational drills kill a worker after publish, lose Redis and restore from backup into isolation.

## Fixture oracles
The academic fixture leaves one lecture seat and no laboratory seat. The expected result is a capacity refusal, no new credit and no lecture claim. The solver fixture puts two classes in one room with one later alternative. Selecting the later A placement and the pinned B placement produces a feasible penalty of 3. Altering the later interval to overlap produces no valid timetable. Distinguish checking these hand-built oracles from testing a running application.
The scenario catalog records Given, When and Then for each test. Build a concurrent suite that repeats each interleaving and reconciles ledger facts instead of accepting response counts alone. Include equal-time deadlines, partial provider failure and migration collisions. A release record should state fixture hash, test version, database build, environment, observations, reviewer and unresolved failures.

## Decision and open question
Proposed: Require real database races and independently computed oracles. Assumed: QA can provision isolated PostgreSQL and run controlled fault injection.

Needs approval (RISK-008) — Shared term guards and hot capacity pools. Database reviewer: Run real PostgreSQL contention tests and tune.

## References
[test scenarios](../artifacts/test-scenarios.yaml) · [academic facts](../artifacts/examples/academic-facts.json)
