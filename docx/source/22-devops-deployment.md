# Deployment and change control

DOC-22 · Version 0.1 · proposed · Owner: Operations lead

**Purpose and scope** — Promote compatible releases and recover safely from partial rollout.

**Audience** — Release engineers and database reviewers.

**Dependencies** — [System architecture](12-system-architecture.md), [Events, jobs and integrations](18-events-jobs-integrations.md), [Recovery and incident runbooks](24-backup-disaster-recovery-runbooks.md).

## Environment and release pipeline
Use synthetic fixtures in development and CI, realistic redacted or synthetic scale in staging, and separate production credentials and data stores. Store versioned public configuration (term zone, driver timeouts, feature gates) apart from runtime secrets. Validate mandatory settings before readiness. Distinct service accounts cover migration DDL, API transactional writes, read-only reports, outbox relay and restore operations.
On a candidate build, run static checks, contract comparison, schema migrations on an isolated copy, role negatives, real contention tests and restore smoke tests. Build immutable web, API, worker and solver artifacts. Promote by digest; record schema compatibility range and expected contract version. Deployment health checks distinguish process liveness from database, identity and worker readiness. Keep solver unavailability from blocking existing registration.

## Compatible change and rollback
Expand first with nullable/additive columns, deploy dual-compatible readers and writers, backfill in audited batches, reconcile and switch reads. Only contract the old format after rollback and replay windows close. Roll back the application to the previous compatible image. When data changed irreversibly, freeze writes and forward-correct through an audited migration under database-owner supervision.
Stop worker intake, finish or release durable leases, flush receipts, and leave uncertain sends for reconciliation. Separate queue Redis with non-evicting memory policy, capacity alerts, persistence and tested recovery. Cache Redis may evict disposable entries. Keep deployment diagrams and secret references in the release record; never include secret values.

## Decision and open question
Proposed: Separate durable queue Redis from disposable caching. Assumed: Operations can isolate credentials and databases per environment.

Needs approval (RISK-005) — Workload, recovery budgets and solver limits. Operations lead: Collect workload, restore drill and target sign-off.

## References
[module catalog](../artifacts/module-catalog.yaml) · [event catalog](../artifacts/event-catalog.yaml)

[Going to production](https://docs.bullmq.io/guide/going-to-production)
