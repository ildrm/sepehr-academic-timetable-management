# Pin academic decisions to versions

ADR-010 · Version 0.1 · proposed · Owner: Registrar

**Purpose and scope** — Decide how to address the following design pressure. A changed policy or room assignment can invalidate historic explanations.

**Audience** — Registrar, implementation leads and quality reviewers.

**Dependencies** — [Academic domain and curriculum](../05-academic-domain-curriculum.md), [Academic rule evaluation](../06-academic-rule-engine.md), [Calendar and academic workflows](../07-calendar-state-workflows.md), [Timetabling optimization](../10-timetabling-optimization.md).

## Alternatives and decision
Overwriting current rows loses provenance. Freezing all rules forever prevents approved changes.

Pin student curriculum and policy editions; publish immutable timetable versions with hash, epoch and validation record.

## Rationale and consequences
Past decisions remain explainable and a replacement can be compared before activation. Maintain correction and cohort migration workflows.

## Risks, assumptions and open question
Applying a new edition to existing students without authorization changes requirements. Assumed: Admission records identify program and curriculum edition.

## Reconsideration trigger
Reconsider version granularity after approved retroactive corrections expose a missing effective-date dimension. The registrar owns review and approval.

## References
[Academic domain and curriculum](../05-academic-domain-curriculum.md), [Academic rule evaluation](../06-academic-rule-engine.md), [Calendar and academic workflows](../07-calendar-state-workflows.md), [Timetabling optimization](../10-timetabling-optimization.md).
