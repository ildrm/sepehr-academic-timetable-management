# Implementation changes

## Release preparation · 22 November 2026

- Added staged batch allocation with seed commitment, solver leases, eligibility and capacity revalidation, and atomic publication.
- Added live timetable impact review, independent approval and affected-student notices.
- Ranked bounded schedule suggestions by student course preferences and returned the policy and timetable versions used. Added allocated record IDs and a repeatable record revision to degree audits.
- Added scoped demand and disruption CSV exports and updated seat export metadata. All three apply an approved suppression threshold.
- Added HTTPS notification delivery with durable retry and acknowledgment, institutional session assurance, health and monitoring, verified TLS dependency settings, restricted database roles and separated migration execution.

## 0.1 · 22 November 2026

- Preserved the design archive and inventoried its requirement, acceptance and decision sources.
- Added Next.js, Nest.js, Prisma, PostgreSQL, BullMQ, Redis and the OR-Tools solver with isolated local fixtures.
- Implemented guarded student enrollment, waitlist offers, replayable outcomes, asynchronous planning and independent publication.
- Added scoped policy and curriculum draft/approval, academic record revisions and import, instructor availability, reports and an OIDC adapter.
- Collected local application build and test evidence. See the validation report for exact outcomes and release limits.
