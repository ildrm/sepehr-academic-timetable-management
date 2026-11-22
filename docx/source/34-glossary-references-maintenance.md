# Glossary and maintenance

DOC-34 · Version 0.1 · proposed · Owner: Documentation lead

**Purpose and scope** — Maintain stable meanings, source provenance and controlled revisions.

**Audience** — All readers and document owners.

**Dependencies** — [Academic management system](00-overview-scope.md), [Risks and open decisions](32-risks-assumptions-open-decisions.md), [Traceability and delivery gates](33-quality-review-traceability.md).

## Vocabulary
|Term|Meaning in this suite|
|---|---|
|Academic standing|An institution-defined status computed from ratified academic facts, used only under an approved policy.|
|Bundle|A single selectable section and its complete, compatible component choices.|
|Capacity pool|The physical seat budget shared by all linked sections or components that reference it.|
|Claim|One occupied unit in one pool, backed by active enrollment or an offered waitlist hold.|
|Epoch|A database version counter advanced under a guard when authoritative inputs change.|
|Idempotency|A repeated intent in a defined namespace resolves to its original recorded outcome.|
|Outbox|A durable table written atomically with academic changes, later consumed by a relay.|
|Placement|A candidate instructor, room and pattern of dated occurrences for a class.|
|Watermark|The latest consistent source position reflected by a read model or export.|
## Reference and approval conventions
Confirmed describes observed evidence such as a repository file. Proposed describes a design choice. Assumed records a provisional premise and its consequences. Needs_approval identifies an unresolved institutional or operational decision. Source records give publisher, claim, version context, URL and access date. A rolling guide does not select a dependency version for this repository. Identifiers remain stable across releases; retired IDs remain reserved.
## Technical reference register
The source register records the full URL, version context and access date for each claim. Select project versions through dependency review when an implementation exists.

| Publisher and work | Claim used in the design |
| --- | --- |
| PostgreSQL Global Development Group · Explicit Locking | Row locks coordinate conflicting writers; consistent acquisition order reduces deadlocks. |
| Google OR-Tools · CP-SAT Solver | Integer formulation and distinct feasible, optimal, infeasible, invalid and unknown outcomes. |
| Vercel · Server and Client Components | Server and client boundaries partition rendering and interactive code. |
| NestJS · Modules | Providers and exports delimit module interfaces. |
| Prisma · Transactions | A transaction groups operations with one commit or rollback. |
| BullMQ · Going to production | Redis persistence and noeviction settings matter for queue deployments. |
| OpenAPI Initiative · OpenAPI Specification | Contract format, schema objects and security requirements. |
| OWASP Foundation · Authorization Cheat Sheet | Deny by default and check permissions on each request. |
| W3C · Web Content Accessibility Guidelines | Keyboard access, contrast, labeling and status messages inform acceptance. |
| JSON Schema project · JSON Schema | Dialect for restricted recursive rule and integration contracts. |

## Change control
The owner edits Markdown and its authoritative artifact first. Identify dependent requirements, ADRs, diagrams, examples and user guides. Record the decision, effective date and superseded edition in the changelog. Rebuild Word copies and rerun validation. A source or binary hash change invalidates its previous visual evidence. Archive accepted release bundles with approval records in the institution’s controlled repository. Review references at dependency selection and after material upstream changes.

## Decision and open question
Proposed: Maintain Markdown and native contracts as build inputs. Assumed: The institution can maintain a controlled artifact repository.

Needs approval (RISK-004) — Retention and access delegation. Privacy officer: Approve class-specific schedule and role review.

## References
[module catalog](../artifacts/module-catalog.yaml) · [requirements](../artifacts/requirements.csv)

[Explicit Locking](https://www.postgresql.org/docs/17/explicit-locking.html) · [CP-SAT Solver](https://developers.google.com/optimization/cp/cp_solver) · [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) · [Modules](https://docs.nestjs.com/modules) · [Transactions](https://www.prisma.io/docs/orm/fundamentals/transactions) · [Going to production](https://docs.bullmq.io/guide/going-to-production) · [OpenAPI Specification](https://spec.openapis.org/oas/v3.1.1.html) · [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) · [Web Content Accessibility Guidelines](https://www.w3.org/TR/WCAG22/) · [JSON Schema](https://json-schema.org/draft/2020-12)
