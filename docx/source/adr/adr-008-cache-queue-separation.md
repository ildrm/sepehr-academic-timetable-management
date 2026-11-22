# Separate cache and job storage

ADR-008 · Version 0.1 · proposed · Owner: Operations lead

**Purpose and scope** — Decide how to address the following design pressure. Cached views are disposable. Evicting a queued job can delay an offer or publication notice.

**Audience** — Operations lead, implementation leads and quality reviewers.

**Dependencies** — [Events, jobs and integrations](../18-events-jobs-integrations.md), [Deployment and change control](../22-devops-deployment.md).

## Alternatives and decision
Shared eviction settings conflate durability and cache efficiency. A database-only scheduler adds polling cost.

Use separate Redis deployments for cache and BullMQ; use persistent non-evicting queue storage and recover from durable jobs.

## Rationale and consequences
The two workloads can have independent memory, persistence and recovery policies. Provision separate credentials, alerts and restore drills.

## Risks, assumptions and open question
A technical queue outage still delays external effects. Assumed: Adapters can correlate provider references with durable events.

## Reconsideration trigger
Reconsider after recovery drills or traffic measurements show a different cost or durability envelope. The operations lead owns review and approval.

## References
[Events, jobs and integrations](../18-events-jobs-integrations.md), [Deployment and change control](../22-devops-deployment.md).
