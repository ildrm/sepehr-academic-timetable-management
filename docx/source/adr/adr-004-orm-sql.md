# Prisma with reviewed SQL paths

ADR-004 · Version 0.1 · proposed · Owner: Backend lead

**Purpose and scope** — Decide how to address the following design pressure. Most reads and domain writes map naturally to a typed data-access API. Guard locking and partial indexes need explicit SQL semantics.

**Audience** — Backend lead, implementation leads and quality reviewers.

**Dependencies** — [Nest.js application design](../13-nestjs-backend-design.md), [Academic data dictionary](../15-data-model-dictionary.md), [Registration transactions](../17-transactions-consistency.md).

## Alternatives and decision
An entirely handwritten data layer increases repetition. ORM-only design can hide critical locking or unsupported DDL.

Start with Prisma. Keep parameterized lock statements and constrained indexes under database review on the same transaction connection.

## Rationale and consequences
Reviewers can inspect lock order without giving up typed repositories elsewhere. Pin a compatible client once versions are chosen. Test generated queries against isolated PostgreSQL.

## Risks, assumptions and open question
Using a separate connection inside a guarded operation breaks atomicity. Assumed: Modules can share one transaction-scoped database connection.

## Reconsideration trigger
Revisit after inspecting generated plans or a driver change affecting transaction behavior. The backend lead owns review and approval.

## References
[Nest.js application design](../13-nestjs-backend-design.md), [Academic data dictionary](../15-data-model-dictionary.md), [Registration transactions](../17-transactions-consistency.md).
