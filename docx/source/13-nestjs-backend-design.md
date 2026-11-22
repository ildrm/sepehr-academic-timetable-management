# Nest.js application design

DOC-13 · Version 0.1 · proposed · Owner: Backend lead

**Purpose and scope** — Structure synchronous commands and module dependencies inside one academic core.

**Audience** — API and worker engineers.

**Dependencies** — [System architecture](12-system-architecture.md), [API contracts and errors](16-api-contracts-errors.md), [Registration transactions](17-transactions-consistency.md).

## Command slice
A controller authenticates the caller, validates the transport object and maps error codes. The enrollment application service opens the unit of work, requests guards in the global order and gathers current facts. Domain functions operate on the final course set and return decisions with stable reasons. A repository translates typed commands to Prisma or reviewed, parameterized SQL on the same transaction connection. A controller cannot decide academic eligibility.
|Layer|Inputs and outputs|Example responsibility|
|---|---|---|
|Presentation|Session, payload and headers to command|Resolve actor, reject unexpected subject and invalid DTO fields.|
|Application|Command to stored receipt or reason|Coordinate policy, seats, audit and outbox.|
|Domain|Immutable facts to decision|Evaluate final-set eligibility and allowed component combinations.|
|Infrastructure|Transaction-scoped ports to rows|Lock student-term and pool rows in stable order.|

## Ownership and dependencies
Identity and Institution resolve subjects and organizational scope. Catalog, Curricula and Records supply course identities, editions and recorded outcomes. Instructors, Resources, Offerings and Calendar supply teaching inputs. Policies and Approvals deliver rules and grants. Timetabling and Enrollment coordinate their respective changes. Audit, Events, Notifications and Reporting manage evidence and subsequent effects.

The module catalog names owners of each core table and the allowed dependency direction. The policy module accepts facts supplied by the caller. It cannot import enrollment to look up a mutable basket. Approvals publishes grant changes through an outbox port. Notifications and reporting consume events. These boundaries remove the common Enrollment → Policies → Enrollment cycle. CI should topologically sort the import graph and reject a cycle.
The waitlist worker invokes the enrollment application operation with a service principal, a delegated scope and the target student. It uses the same rule and locking paths as an interactive request. Map known constraint failures to stable public errors. Retry only classified transient errors after the transaction aborts. Unexpected failures produce a request ID and a redacted operational trace.

## Decision and open question
Proposed: Keep policy evaluation pure and orchestrate writes through application services. Assumed: Modules can share one transaction-scoped database connection.

Needs approval (RISK-008) — Shared term guards and hot capacity pools. Database reviewer: Run real PostgreSQL contention tests and tune.

## References
[module catalog](../artifacts/module-catalog.yaml) · [error catalog](../artifacts/error-catalog.yaml)

[Modules](https://docs.nestjs.com/modules) · [Transactions](https://www.prisma.io/docs/orm/fundamentals/transactions)
