# Observability and academic reports

DOC-23 · Version 0.1 · proposed · Owner: Reporting lead

**Purpose and scope** — Measure service health and deliver scoped, reproducible academic totals.

**Audience** — Operations, academic analysts and auditors.

**Dependencies** — [Academic data dictionary](15-data-model-dictionary.md), [Events, jobs and integrations](18-events-jobs-integrations.md), [Security and privacy](19-security-privacy-threat-model.md).

## Signals and ownership
|Signal|Collection and interpretation|Action owner|
|---|---|---|
|Enrollment p95/p99 and lock waits|Correlate ingress request ID, guarded transaction duration and blocked relation; separate capacity denials from technical failures.|Operations and database reviewer|
|Deadlocks, retry exhaustion and capacity conflicts|Count by command, term and coarse pool group. Reconcile hot pools before capacity changes.|Backend lead and registrar|
|Queue backlog, oldest age and outbox lag|Monitor both ready jobs and durable unpublished age. An empty broker can coexist with a stalled relay.|Worker owner|
|Solver quality and freshness|Track status, first feasible time, objective vector, unassigned count and stale proposal rate.|Planning lead|
Trace a request through BFF, Nest.js and outbox correlation ID. Bound label cardinality and exclude student identifiers and grade details from telemetry. An academic audit records attributable decisions for authorized investigation; it requires separate access, preservation and retention.

## Academic reports
| Report and audience | Computation and interpretation |
| --- | --- |
| REP-001 Seat utilization · Registrar | live enrollment claims / physical pool capacity; zero denominator is undefined; display open offers separately. cross-listed pools counted once. |
| REP-002 Unmet demand · Planner | count distinct queued students per bundle at watermark; show incompatible bundles separately. one student can request alternatives; bundle counts are nonadditive. |
| REP-003 Degree progress · Advisor | sum uniquely allocated recognized credits / credits required by pinned group. provisional work shown separately. |
| REP-004 Schedule disruption · Department head | count distinct enrolled students whose time, campus or section changes between versions. students can occur in multiple department totals. |
Produce each report from a scoped read model or replica with an explicit watermark. Apply authorization before aggregation and again at download. Record formula version, source watermark, filters, units and suppression rules with each export. Rate-limit heavy requests outside peak writes. Report freshness to the reader when projection lag exceeds the ratified report budget. A retrospective correction produces a new report revision with provenance.

## Decision and open question
Proposed: Disclose the projection watermark of every academic report. Assumed: Reports may tolerate an explicitly disclosed projection delay.

Needs approval (RISK-004) — Retention and access delegation. Privacy officer: Approve class-specific schedule and role review.

## References
[report catalog](../artifacts/report-catalog.yaml) · [event catalog](../artifacts/event-catalog.yaml)
