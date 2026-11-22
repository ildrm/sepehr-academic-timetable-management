# Development operations and deployment boundaries

The [production deployment runbook](../infra/deployment/README.md) covers the immutable image, service credentials, controlled migrations, assurance checks and monitoring.

## Observe readiness

The API exposes `/health/live` for process health and `/health/ready` for database migration readiness. The worker waits for Redis before announcing readiness. The frontend BFF returns private, non-cacheable responses. Configure an ingress only with an approved HTTPS origin, provider configuration and network controls.

## Investigate queues

Inspect `outbox_event` with `consumer_receipt` and `quarantine_event`. Unacknowledged committed events are redispatched under their existing IDs. A quarantined event blocks later effects on the same aggregate until investigated. Do not treat an entry in BullMQ as an academic action. Before replaying outside a test system, confirm the consumer effect and receipt state. The worker can reconstruct pending solver, waitlist and event work from PostgreSQL after Redis returns.

## Investigate capacity

Query each pool using `seat_claim`, active enrollments and offered waitlists with expiry greater than database decision time. Compare counts to physical capacity and unreleased reservations. Freeze the affected term’s write path if they diverge. Any repair must use the term, queue and pool guards, with an audit entry and independent approval. A real discrepancy has no unattended repair command in this release.

## Back up, recover and roll back

Use `pg_dump --format=custom` only with an authorized database connection and a protected destination. Restore into a new isolated database with the corresponding PostgreSQL tools and verify enrollments, claims, publications and outbox receipts before serving reads. Never restore over the current database as a first response. The local restore check dumps the synthetic database and restores it into a newly created isolated database. It compares enrollment, publication and event counts and verifies the seat-claim invariants. Point-in-time recovery and downstream replay still require a separate drill. [Local restore command](../infra/local/restore-check.sh) Promote migrations separately using `npm run db:migrate` on a controlled runner, then deploy a compatible code build. Use an application rollback only when the previous version supports the deployed schema.
