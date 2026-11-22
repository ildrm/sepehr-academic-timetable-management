# PostgreSQL owns academic facts

ADR-003 · Version 0.1 · proposed · Owner: Database reviewer

**Purpose and scope** — Decide how to address the following design pressure. Cross-listed seats, active records and queue rank must survive outages and races.

**Audience** — Database reviewer, implementation leads and quality reviewers.

**Dependencies** — [Academic data dictionary](../15-data-model-dictionary.md), [Registration transactions](../17-transactions-consistency.md).

## Alternatives and decision
Redis counters provide fast reads but can diverge. Separate faculty ledgers cannot enforce shared pools directly.

Write enrollment, claims, holds, rank, audit and outbox in PostgreSQL. Treat each table as one module’s responsibility.

## Rationale and consequences
A shared transaction establishes which physical seats were consumed and why. Build read models asynchronously and reconcile them to authoritative rows.

## Risks, assumptions and open question
Hot pools may serialize traffic. Assumed: Stable source identifiers exist for student, course and term.

## Reconsideration trigger
Reconsider partitioning after measured contention, with a demonstrated cross-partition invariant. The database reviewer owns review and approval.

## References
[Academic data dictionary](../15-data-model-dictionary.md), [Registration transactions](../17-transactions-consistency.md).
