# Product requirements

DOC-01 · Version 0.1 · proposed · Owner: Product owner

**Purpose and scope** — Decide which academic outcomes belong in the first release.

**Audience** — Academic leadership and product team.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Enrollment and waitlists](09-enrollment-waitlist.md), [Student planning and degree audit](11-student-scheduling-degree-audit.md).

## Outcomes and priority
|Priority|User outcome|Acceptance evidence|
|---|---|---|
|Release gate|A student receives one authoritative receipt for one intent.|Replay the request after a lost response and compare the enrollment and claims.|
|Release gate|The academic office can explain why two students on different curricula receive different decisions.|Reproduce each decision with its pinned policy and academic record revisions.|
|Release gate|An advisor can see the unmet part of a degree requirement.|Recompute allocations and show each completion used in each group.|
|Release gate|Planners can publish a usable term timetable.|Validate every occurrence, pin and required component against current resources.|
|Later release|Finance and learning systems consume approved changes.|Reconcile subject, course and term identifiers under a signed integration contract.|

## Journeys that determine scope
A first-term student with an empty basket adds a linked bundle. The provisional result includes remaining requirements but makes no reservation. At confirmation a seat can have gone to an earlier eligible applicant. The student can then inspect other bundles or join the waitlist.
A planner edits a room after a solution has been prepared. The proposed version carries its original snapshot. Publication stops until a candidate incorporating the change is checked. A department head can see displaced students before approving a repair through the designated approver.

## Release decision
Prioritize record integrity, scoped access, manual planning and recoverable enrollment before optimizing timetable quality. Make the solver available after manual validation works on the same fixtures. Product acceptance requires a baseline for deadline disputes, duplicate writes, allocation appeals and recovery drills. Targets await the institution’s operating data.

## Decision and open question
Proposed: Prioritize recoverable registration and independent validation before advanced scheduling. Assumed: The office can supply representative journeys and disputed decisions.

Needs approval (RISK-002) — Waitlist tiers, reserve release and allocation tie-breaks. Registrar: Approve priority, bundle contention and appeal process.

## References
[requirements](../artifacts/requirements.csv) · [traceability](../artifacts/traceability.csv)
