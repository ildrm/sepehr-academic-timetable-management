# Student planning and degree audit

DOC-11 · Version 0.1 · proposed · Owner: Academic policy owner

**Purpose and scope** — Build individual alternatives, allocate scarce bundles and explain degree progress.

**Audience** — Advisors, registrar and allocation designers.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Academic rule evaluation](06-academic-rule-engine.md), [Enrollment and waitlists](09-enrollment-waitlist.md), [Timetabling optimization](10-timetabling-optimization.md).

## Individual planning
Start with the student’s curriculum, remaining groups, active enrollment, permitted term offerings and preferences. Enumerate complete lecture/lab bundles. Remove incompatible time and travel combinations. Check final-set course rules and the upper credit bound. Rank feasible schedules by the student’s expressed priorities and show alternatives with reasons for tradeoffs. An offer seen during planning can expire before commit. Return policy and timetable versions with each suggestion.
## Batch allocation
For each student s and bundle b choose y(s,b) in {0,1}. Constrain pool totals, session conflicts, exclusive alternatives and final-set eligibility. Proposed objective: respect approved priority tiers first, then maximize the minimum fraction of requested required credits met within a tier, then total satisfaction. For zero demand exclude the student from the fraction and report separately. Break equal results by a reproducible lottery derived from a precommitted seed and pseudonymous application ID. Keep the seed and ordered input for an appeal. Report distribution by approved cohort, unmet required credits and tie outcomes. Registrar approval of fairness criteria, random draw and reserved access is a launch gate.
Freeze the eligible request window and hold the resulting plan as a proposal. Revalidate each allocation against current publication, student record and queue priority before scheduling authorized commits. If any prior allocation changes feasibility or rank, halt and recompute affected contenders. A batch allocation must not displace students already holding claims.
## Degree audit
Resolve latest effective attempt per lineage, select ratified repeat/grade policy and recognize directed, dated transfer equivalencies. Allocate each completion to eligible groups under its sharing limit. Prefer mandatory groups before electives, then stable group IDs where the approved policy allows. Backtrack or optimize to avoid a greedy assignment that blocks a required group. Return group requirement, allocated completion IDs/credits, shortfall, provisional work and applied exceptions. Pin the record revision and curriculum edition so an advisor can reproduce the result.

## Decision and open question
Proposed: Keep proposed schedule ranking separate from the final allocation command. Assumed: The institution can disclose its allocation priorities to reviewers.

Needs approval (RISK-002) — Waitlist tiers, reserve release and allocation tie-breaks. Registrar: Approve priority, bundle contention and appeal process.

## References
[requirements](../artifacts/requirements.csv) · [test scenarios](../artifacts/test-scenarios.yaml)
