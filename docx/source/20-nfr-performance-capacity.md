# Performance and capacity

DOC-20 · Version 0.1 · proposed · Owner: Operations lead

**Purpose and scope** — Set measurable budgets and build a representative registration workload.

**Audience** — Operations and performance testers.

**Dependencies** — [Registration transactions](17-transactions-consistency.md), [Test and verification strategy](21-test-verification-strategy.md), [Observability and academic reports](23-observability-reporting.md).

## Parameterized service objectives
All budgets below are proposals awaiting institutional values and a measured workload. A percentile describes the distribution over the stated observation window. Separate successful, rejected and timed-out requests in reports to avoid hiding failures.
|Indicator|Proposed acceptance expression|Measurement|
|---|---|---|
|Interactive response|p95 login <= LOGIN_P95; p95 search <= SEARCH_P95; p95 capacity read <= READ_P95|Measure browser action to response at the ingress under the approved mix.|
|Enrollment decision|p95 and p99 committed/rejected latency <= WRITE_P95 / WRITE_P99|Measure BFF receipt through database result, including waits and retries.|
|Availability|Eligible requests completed within budget / eligible submitted >= AVAIL_TARGET|Calculate across a ratified registration window. Classify legitimate academic denials as completed.|
|Queue freshness|p95 age from outbox commit to accepted consumer receipt <= LAG_P95|Track stalled partitions and maximum lag separately.|
|Solver|fraction of benchmark runs with a feasible proposal by SOLVE_BUDGET >= FEASIBLE_TARGET|Use fixed datasets, compare seeds, objective vector, hardware and incumbent.|
## Workload design
Parameterize cohort size, appointments per opening, login burst, searches/session, refresh rate, write attempts, hot-pool concentration, rejection ratio and client retries. Compute peak attempt rate from concurrent users times attempts per user per window. Model separate identity, read and write dependencies. Ramp gradually, then inject synchronized opening, duplicate-key traffic, delayed outbox and slow database I/O.
Find the first constraint by recording CPU, active connections, queue guard waits, pool skew, transaction retries and cache hit rates. Repeat after tuning with identical workload and dataset. Establish operational alert thresholds from accepted budgets. Sizing and any move to partitioned queue coordination depend on correctness-preserving contention measurements.

## Decision and open question
Proposed: Approve numerical budgets only after collecting representative load evidence. Assumed: Representative synthetic load can be calibrated against opening-window evidence.

Needs approval (RISK-005) — Workload, recovery budgets and solver limits. Operations lead: Collect workload, restore drill and target sign-off.

## References
[requirements](../artifacts/requirements.csv) · [test scenarios](../artifacts/test-scenarios.yaml)
