# Traceability and delivery gates

DOC-33 · Version 0.1 · proposed · Owner: Quality lead

**Purpose and scope** — Inspect the evidence supporting each technical and academic acceptance gate.

**Audience** — Reviewers and release authorities.

**Dependencies** — [Requirements and use cases](02-software-requirements-use-cases.md), [Test and verification strategy](21-test-verification-strategy.md), [Risks and open decisions](32-risks-assumptions-open-decisions.md).

## Evidence chain
The requirements registry is the contract with product owners. Each row has acceptance criteria. The traceability matrix maps the same ID to its rule or explicit reason for nonapplicability, owning module, interface, table, design file and scenario IDs. Coverage describes design linkage. Product acceptance requires observed results from the implementation and a named accountable role.
## Contradiction review
|Potential disagreement|Resolution in this edition|Outstanding proof|
|---|---|---|
|Linked lab adds credit or cross-list adds seats|Store credit once per enrollment and one claim per distinct pool.|Real concurrent component and quota tests.|
|Queue workers choose winners independently|Academic ordering uses PostgreSQL guards and priority; jobs only wake processors.|Registrar ratification and workload benchmark.|
|Solver succeeds after a source edit|Publish only with independent checks on the same hash and current epoch.|Stale-output and repair drills.|
|Minimum credit prevents first addition|Apply lower limit at finalization and to changes after finalization.|Ratify workflow stage and confirm registrar examples.|
|Receipt lost or provider sends twice|Recover stored key outcomes and deduplicate events and effects.|Fault injection at both commit/ack boundaries.|
## Delivery gates
Design gate checks native schemas, diagrams, matched Word files and registry integrity. Implementation gate requires domain, cross-scope, contract and real-database concurrency tests. Operations gate requires volume baselines, restoration, alert routing and reconciled imports. Academic gate requires signed curricula, quotas, appointment rules and approved exception authority. The validation report lists executed document checks and any remaining visual or runtime gaps. Reopen affected gates whenever a normative decision changes.

## Decision and open question
Proposed: Keep documentation checks separate from operational release evidence. Assumed: Each acceptance owner can obtain test evidence before release.

Needs approval (RISK-008) — Shared term guards and hot capacity pools. Database reviewer: Run real PostgreSQL contention tests and tune.

## References
[traceability](../artifacts/traceability.csv) · [requirements](../artifacts/requirements.csv) · [test scenarios](../artifacts/test-scenarios.yaml)
