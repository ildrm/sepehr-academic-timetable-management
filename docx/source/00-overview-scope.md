# Academic management system

DOC-00 · Version 0.1 · proposed · Owner: Product owner

**Purpose and scope** — Set the boundaries of the institutional service and its release gates.

**Audience** — Steering group, registrar, engineering leads.

**Dependencies** — [Product requirements](01-product-requirements.md), [Risks and open decisions](32-risks-assumptions-open-decisions.md).

## What the service delivers
A student should be able to choose a lecture and its required laboratory, understand a rejection and later recover a registration receipt. A planner should be able to show why each published class fits its room, instructor and teaching weeks. Today the repository establishes only a project name and license. No application, package lock, institutional policy or deployment configuration was present in the inspected checkout (commit 5ed0322).

## Boundaries and stakeholders
The registrar owns the enrollment ledger and the rules that interpret academic records. Departments supply teaching demand, instructor qualifications and resource restrictions. Students and advisors depend on the same curriculum edition and reason codes. Technical operations staff recover data and jobs under separate authority. One institution may share courses and rooms across its faculties. A faculty is an authorization scope within that institution.

## Release evidence
A release candidate needs an approved policy pack, reconciled student records, verified physical capacity, an independently validated timetable and a tested recovery path. The registrar must be able to reconstruct a disputed seat decision from the policy version, decision time, identity and claim history. Quality staff must reproduce last-seat contention in an isolated database. The steering group decides release after these artifacts exist.

## Extension boundary
The core consumes confirmed completions and effective dates. Grade entry, appeals, transcripts, exams, attendance, payment and learning platforms require their own records and authority. Opening registration cannot depend on those projects unless an approved policy explicitly adds a dependency.

## Decision and open question
Proposed: Use the first release to register students against approved records and a published term timetable. Assumed: A single academic authority can appoint stewards across faculties.

Needs approval (RISK-001) — Thresholds, GPA scales, exception and sharing parameters. Academic senate delegate: Approve policy editions, samples and applicability.

## References
[requirements](../artifacts/requirements.csv) · [risks assumptions decisions](../artifacts/risks-assumptions-decisions.csv)
