# Durable command outcomes

ADR-006 · Version 0.1 · proposed · Owner: Backend lead

**Purpose and scope** — Decide how to address the following design pressure. A commit can succeed while its response is lost.

**Audience** — Backend lead, implementation leads and quality reviewers.

**Dependencies** — [API contracts and errors](../16-api-contracts-errors.md), [Registration transactions](../17-transactions-consistency.md).

## Alternatives and decision
A client-only key has no recovery record. Active-course uniqueness alone cannot recover a drop or a rejected swap.

Claim actor, operation and key and store normalized payload hash and original outcome in the command transaction.

## Rationale and consequences
Retries converge on one fact and a different payload is detectable. Retain outcomes beyond the approved retry horizon and protect status reads.

## Risks, assumptions and open question
Premature cleanup can turn a delayed retry into a new operation. Assumed: Client callers can persist one opaque key per intent.

## Reconsideration trigger
Revisit the window when queues, devices or clients introduce longer offline periods. The backend lead owns review and approval.

## References
[API contracts and errors](../16-api-contracts-errors.md), [Registration transactions](../17-transactions-consistency.md).
