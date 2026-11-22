# Recovery and incident runbooks

DOC-24 · Version 0.1 · proposed · Owner: Operations lead

**Purpose and scope** — Restore academic authority and reconcile effects after disruption.

**Audience** — Incident commanders, database and registrar staff.

**Dependencies** — [Registration transactions](17-transactions-consistency.md), [Events, jobs and integrations](18-events-jobs-integrations.md), [Observability and academic reports](23-observability-reporting.md).

## Recovery contract
The recovery point objective RPO_DB limits acceptable committed-data loss. The recovery time objective RTO_REG measures disruption until authorized registration can safely resume. Both are proposed named budgets. Database reviewer and registrar must agree the measurement origin, tolerable loss and reconciliation procedure. Protect encrypted base backups and continuous write-ahead log archives in a separate failure domain. Preserve required encryption keys and access for the entire approved backup lifetime.
Restore a base backup and logs to an isolated target before the incident, compare recovery position and UTC time, validate row counts, active course uniqueness, quotas, live holds, publication hash and audit/outbox continuity. Rebuild queues from durable jobs, check provider receipts, replay by event ID and reapply approved redactions. Measure achieved loss and elapsed recovery. Obtain operations and registrar sign-off before opening traffic.

## Incident actions
|Incident and signal|Containment and recovery|Exit evidence|
|---|---|---|
|Spike: waits or retry budget breached|Throttle noncritical refresh and export work; retain appointment and access checks. Inspect hot locks and drain safely.|Tail latency, throughput and invariant recount recover under actual load.|
|Capacity mismatch|Freeze affected pools, recount active bundles and holds under lock, compare audit history. Authorize an attributed correction.|Ledger and physical inventory reconcile; affected students reviewed.|
|Database unavailable|Stop mutations, preserve ambiguous keys, restore or fail over under fencing and reconcile committed receipts.|Exactly one writable authority; verified recovery position.|
|Queue/Redis outage|Preserve PostgreSQL writes; hold dispatch. Restore queue capacity and repopulate outstanding facts.|Oldest durable event drains; receipt audit shows no duplicate effect.|
|Section cancellation|Close new claims, list active and offered students, plan alternatives and request registrar approval.|Every displaced student has an audited resolution or open case.|
|Instructor replacement|Freeze affected placements, verify qualification/load and travel, build a repair candidate.|Independent validation, approved version and dated notices.|
|Wrong timetable published|Stop further edits, compare last known-good version against current changes and attendance impact. Republish a validated correction.|One current publication and reconciled notices with old/new times.|

## Decision and open question
Proposed: Reopen registration only after database authority and downstream effects reconcile. Assumed: Backups, archive logs and encryption material can be restored in isolation.

Needs approval (RISK-005) — Workload, recovery budgets and solver limits. Operations lead: Collect workload, restore drill and target sign-off.

## References
[test scenarios](../artifacts/test-scenarios.yaml) · [event catalog](../artifacts/event-catalog.yaml)
