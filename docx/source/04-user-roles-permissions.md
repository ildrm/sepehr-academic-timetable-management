# Product roles and permissions

DOC-04 · Version 0.1 · proposed · Owner: Security lead

**Purpose and scope** — Evaluate access in the context of actor, resource, assignment and time.

**Audience** — Academic administrators and API engineers.

**Dependencies** — [Security and privacy](19-security-privacy-threat-model.md), [Academic office guide](29-education-admin-user-guide.md).

## Decision function
Resolve identity to all current assignments. A single assignment must satisfy the permission, resource, organization, term, relationship and state together. Combining an action from one appointment with a scope from another would grant excess access. A global separation-of-duty prohibition overrides any matching assignment. Re-check on each request and under the mutation guard for sensitive writes.
| Assignment | Typical authorized relationship |
| --- | --- |
| ROLE-001 Student | Own student-term |
| ROLE-002 Instructor | Assigned teaching section |
| ROLE-003 Academic advisor | Current advisee |
| ROLE-004 Department head | Owning department |
| ROLE-005 Academic-office staff | Delegated case or office |
| ROLE-006 Timetable planner | Assigned term and units |
| ROLE-007 Academic administrator | Independent academic mandate |
| ROLE-008 Technical administrator | Infrastructure service only |
| ROLE-009 Auditor | Explicit read-only audit mandate |
## Scope examples
An advisor may read an assigned student’s degree audit during the assignment period. A department head cannot use a faculty-wide course listing to fetch another department’s roster. A technical administrator can retry a failed job under supervision but cannot change a capacity decision. A registrar handling a case records both actor and subject. A second role held by the same actor cannot approve the actor’s own request.
The permission matrix lists positive and negative examples. Unlisted actions default to deny. Log denials by request ID, action and scoped resource class. Keep sensitive record contents out of the denial response. For deferred grading, finance and exam workflows, create separate examiner, bursar and grading-officer grants only when their modules are approved.

## Decision and open question
Proposed: Evaluate a complete assignment and deny unlisted access. Assumed: Record relationships can be resolved from authoritative assignments.

Needs approval (RISK-010) — Data stewardship and maker/checker delegations. Security lead: Test cross-scope grants and independent approval.

## References
[permission matrix](../artifacts/permission-matrix.csv)
