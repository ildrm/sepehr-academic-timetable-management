# Risks and open decisions

DOC-32 · Version 0.1 · proposed · Owner: Product owner

**Purpose and scope** — Resolve uncertainties that could change eligibility, fairness or operations.

**Audience** — Steering group and accountable approvers.

**Dependencies** — [Delivery responsibilities](03-team-roles-raci.md), [Delivery roadmap and backlog](30-roadmap-backlog-delivery.md), [Traceability and delivery gates](33-quality-review-traceability.md).

## Operational acceptance blockers
| Decision and accountable role | Impact and evidence to close |
| --- | --- |
| ASM-001 · Product owner | One institution with multiple faculties. Independent tenants would require identity and isolation redesign. Confirm charter before tenancy design. |
| ASM-002 · Registrar | Legacy records can supply approved completions. Eligibility can be indeterminate at launch. Sign reconciled import and evidence mapping. |
| RISK-001 · Academic senate delegate | Thresholds, GPA scales, exception and sharing parameters. Students may gain or lose eligibility incorrectly. Approve policy editions, samples and applicability. |
| RISK-002 · Registrar | Waitlist tiers, reserve release and allocation tie-breaks. Unfair seat distribution or queue bypass. Approve priority, bundle contention and appeal process. |
| RISK-003 · Product owner | Jurisdiction, timezone, calendar and interval policy. Incorrect deadlines and legal obligations. Record institutional zone, conflict policy and counsel review. |
| RISK-004 · Privacy officer | Retention and access delegation. Overexposure or premature loss of records. Approve class-specific schedule and role review. |
| RISK-005 · Operations lead | Workload, recovery budgets and solver limits. Unmeasurable capacity or recovery promises. Collect workload, restore drill and target sign-off. |
| RISK-006 · Planning lead | Solver weights and hard cohort commitments. Feasible schedules may displace priority groups. Approve constraints and representative benchmark corpus. |
| RISK-007 · Registrar | Final-set minimum-credit enforcement stage. Dropping can strand an invalid registration. Approve draft, finalization and late-change rules. |
| RISK-008 · Database reviewer | Shared term guards and hot capacity pools. Lock convoys at registration opening. Run real PostgreSQL contention tests and tune. |
| RISK-009 · Finance owner | Third-party finance hold freshness and outages. Stale information could deny enrollment. Ratify outage posture before adapter activation. |
| RISK-010 · Security lead | Data stewardship and maker/checker delegations. Privilege leakage or unavailable signatories. Test cross-scope grants and independent approval. |
| RISK-011 · Planning lead | Component compatibility and workload units. Timetable may be feasible on an incorrect input set. Review room, instructor and bundle inventory. |
## Decision procedure
Attach evidence to each register entry: an example accepted and rejected case, affected cohorts, test IDs, decision owner and effective edition. A proposed decision becomes approved through the institution’s recorded authority; changing a document status cannot create that authority. For a disagreement about access or eligibility, freeze the affected release gate while preserving independent work. Record interim behavior and who may resolve appeals.

## Decision and open question
Proposed: Track blockers by accountable role and closure evidence. Assumed: Approvers can supply written policy and reproducible examples.

Needs approval (RISK-003) — Jurisdiction, timezone, calendar and interval policy. Product owner: Record institutional zone, conflict policy and counsel review.

## References
[risks assumptions decisions](../artifacts/risks-assumptions-decisions.csv)
