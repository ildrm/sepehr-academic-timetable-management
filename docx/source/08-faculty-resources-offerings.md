# Instructors, resources and offerings

DOC-08 · Version 0.1 · proposed · Owner: Planning lead

**Purpose and scope** — Convert teaching demand into valid sections, bundles and resource claims.

**Audience** — Department heads and scheduling staff.

**Dependencies** — [Academic domain and curriculum](05-academic-domain-curriculum.md), [Timetabling optimization](10-timetabling-optimization.md), [Academic data dictionary](15-data-model-dictionary.md).

## From demand to a selectable bundle
A department proposes an offering with course, term, credit value, expected demand and sponsoring unit. A planner defines section alternatives and compatible component patterns. Every required lecture and lab has a capacity pool. A cross-listed section may point to a pool already used by another offering. Deduplicate identical pool IDs within a single enrollment bundle. Distinct enrollments can each consume one claim from that pool.
|Input|Responsible steward|Validation before planning|
|---|---|---|
|Instructor, qualification and load|Department head|Effective qualification covers every occurrence. Sum workload under the approved conversion.|
|Availability and travel|Instructor and planner|Expand dated intervals, holidays and campus transitions in the term zone.|
|Rooms and features|Facilities steward|Check usable capacity, essential equipment and accessibility features on every date.|
|Section and component pattern|Offering editor|Every mandatory part has at least one compatible option. Store shared pool once.|
## Capacity adjustment
Physical capacity bounds total claims. Reserved quotas partition seats inside the bound. To reduce capacity, lock the affected pools and compare all active enrollments and open offer holds. Reject a reduction below claims and send a repair case to the registrar. Record old and new values, effective date and approving case. Releasing a reserve changes who can claim an unoccupied seat without creating a seat. Replacement instructors need valid qualifications, availability and load checks on affected occurrences.

## Decision and open question
Proposed: Make shared physical pools explicit when preparing sections. Assumed: Room and instructor inventories have named stewards.

Needs approval (RISK-011) — Component compatibility and workload units. Planning lead: Review room, instructor and bundle inventory.

## References
[core schema](../artifacts/core-schema.sql) · [module catalog](../artifacts/module-catalog.yaml)
