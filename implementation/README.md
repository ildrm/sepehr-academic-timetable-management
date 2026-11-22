# Academic system implementation

The application implements documented development workflows using PostgreSQL as the authority for academic facts, queues, receipts and events. The code reads request and event schemas from the preserved specification. Institutional release acceptance remains open. The [coverage matrix](REQUIREMENTS_COVERAGE.csv) identifies incomplete workflows and unexecuted acceptance scenarios.

| Path | Purpose |
|---|---|
| [Web portal](../apps/web/app/portal.tsx) | Persian and right-to-left interactions plus same-origin forwarding to Nest.js. |
| [API modules](../apps/api/src/main.ts) | Identity, registration, timetabling, academic office and reporting. |
| [Registration](../packages/backend-core/registration.ts) | Guarded final-set policy evaluation, claims and academic waitlists. |
| [Migrations](../prisma/migrations/) | Versioned PostgreSQL schema and database integrity controls. |
| [Worker](../apps/workers/src/main.ts) | Recoverable outbox, ordered academic waitlist processing and solver leases. |
| [Solver](../services/solver/solve.py) | OR-Tools CP-SAT over immutable inputs. |
| [Production runbook](../infra/deployment/README.md) | Compose services, verified TLS, database grants and controlled activation. |

See [workspace setup](../README.md), [specification baseline](SPEC_BASELINE.json), [design decisions](DECISIONS.md), [specification gaps](SPEC_CONFLICTS.md), [validation](VALIDATION_REPORT.md) and [release blockers](BLOCKERS.md).

[Scope map](SCOPE.md) · [Additive API contracts](EXTENDED_API.md) · [Runtime choices](DEPENDENCIES.md) · [Operations](OPERATIONS.md)
