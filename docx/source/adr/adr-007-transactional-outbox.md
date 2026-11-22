# Recoverable event delivery

ADR-007 · Version 0.1 · proposed · Owner: Integration lead

**Purpose and scope** — Decide how to address the following design pressure. Academic commit and external delivery have different failure modes.

**Audience** — Integration lead, implementation leads and quality reviewers.

**Dependencies** — [Events, jobs and integrations](../18-events-jobs-integrations.md), [Recovery and incident runbooks](../24-backup-disaster-recovery-runbooks.md).

## Alternatives and decision
Publish before commit can expose a rolled-back fact. Publish after commit without durable intent can lose a notification.

Write a versioned outbox envelope with each fact and deduplicate consumer effects by event ID.

## Rationale and consequences
A relay can resume from the database after loss of queue or process state. Preserve aggregate sequence, monitor lag and reconcile ambiguous provider effects.

## Risks, assumptions and open question
Consumers without idempotency can duplicate external actions. Assumed: Adapters can correlate provider references with durable events.

## Reconsideration trigger
Revisit transport only when measured throughput or external ordering requires it. The integration lead owns review and approval.

## References
[Events, jobs and integrations](../18-events-jobs-integrations.md), [Recovery and incident runbooks](../24-backup-disaster-recovery-runbooks.md).
