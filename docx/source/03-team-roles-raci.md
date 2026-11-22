# Delivery responsibilities

DOC-03 · Version 0.1 · proposed · Owner: Delivery lead

**Purpose and scope** — Assign accountable decision owners and review evidence.

**Audience** — Product and engineering leadership.

**Dependencies** — [Delivery roadmap and backlog](30-roadmap-backlog-delivery.md), [Traceability and delivery gates](33-quality-review-traceability.md).

## Delivery work and accountability
A delivery role assigns work on the project. Product permissions authorize operations on academic records. A delivery engineer has no academic privilege by virtue of building the system.
|Work product|Responsible|Accountable|
|---|---|---|
|Product scope, policy scenarios|Business analyst and academic-domain expert|Product owner|
|Architecture, data model, lock proof|Architecture lead, backend engineer and database reviewer|Architecture lead|
|Student and planner journeys|UX designer and frontend engineer|Product owner|
|Solver model and benchmark corpus|Optimization engineer and planning expert|Planning lead|
|Verification fixture and release evidence|Test engineer and independent reviewers|Quality lead|
|Threat model, access tests and retention controls|Security reviewer and privacy officer|Security lead|
|Deployments, restore drills and on-call runbooks|Operations engineer and database reviewer|Operations lead|

|Decision|Responsible / accountable|Consulted / informed|
|---|---|---|
|Policy activation|Academic analyst / policy owner|Registrar and QA / student services|
|Timetable repair release|Planner / academic administrator|Faculty and security / affected students and instructors|
|Release restoration|Database engineer / operations lead|Registrar and integration lead / support desk|

## RACI handoffs
RACI assigns responsibility (R), accountability (A), consultation (C) and notification (I). For a policy pack the analyst is R, academic policy owner A, registrar and test engineer C, frontend team I. For a publication workflow the backend lead is R, planning lead A, security and optimization reviewers C, departments I. For a cutover the migration engineer is R, registrar A, operations and privacy leads C, student services I.
One person can perform analysis and product discovery, or implement and support a module. A sensitive approval still requires a different authorized actor from its requester. Review ownership is assigned by role, with a deputy and time-bounded appointment. Estimates follow discovery of data quality and institutional review capacity.

## Decision and open question
Proposed: Assign one accountable role to each deliverable and preserve independent sensitive sign-off. Assumed: The delivery organization can appoint an independent reviewer.

Needs approval (RISK-010) — Data stewardship and maker/checker delegations. Security lead: Test cross-scope grants and independent approval.

## References
[requirements](../artifacts/requirements.csv) · [risks assumptions decisions](../artifacts/risks-assumptions-decisions.csv)
