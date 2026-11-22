# Ordered database guards

ADR-005 · Version 0.1 · proposed · Owner: Database reviewer

**Purpose and scope** — Decide how to address the following design pressure. Two requests can each satisfy a credit ceiling or a last seat when evaluated separately.

**Audience** — Database reviewer, implementation leads and quality reviewers.

**Dependencies** — [Enrollment and waitlists](../09-enrollment-waitlist.md), [Registration transactions](../17-transactions-consistency.md).

## Alternatives and decision
Serializable detects conflicts but still needs bounded retries. Pool-only locking misses student totals.

Use READ COMMITTED with the global ordered guard and re-read protocol in DOC-17.

## Rationale and consequences
The chosen guards cover eligibility and physical scarcity with visible contention points. All grade, policy, quota, calendar and role writers must coordinate with affected readers.

## Risks, assumptions and open question
A writer outside the protocol invalidates the reasoning. Assumed: Queue contenders can be compared for overlapping physical pools.

## Reconsideration trigger
Reconsider if any input cannot be fenced or peak lock waits violate accepted budgets. The database reviewer owns review and approval.

## References
[Enrollment and waitlists](../09-enrollment-waitlist.md), [Registration transactions](../17-transactions-consistency.md).
