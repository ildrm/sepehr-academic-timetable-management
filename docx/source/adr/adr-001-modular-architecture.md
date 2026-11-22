# One modular academic core

ADR-001 · Version 0.1 · proposed · Owner: Architecture lead

**Purpose and scope** — Decide how to address the following design pressure. Enrollment, records and policy need a consistent commit boundary.

**Audience** — Architecture lead, implementation leads and quality reviewers.

**Dependencies** — [System architecture](../12-system-architecture.md), [Nest.js application design](../13-nestjs-backend-design.md).

## Alternatives and decision
A single unstructured process hides ownership. Networked academic services would add coordination before demand is known.

Keep explicitly owned Nest.js modules in one transactional core. Deploy web, API, worker and solver as distinct processes.

## Rationale and consequences
Academic changes can use one database transaction while expensive planning runs independently. Module imports and table ownership need review; the API and workers must deploy compatible domain versions.

## Risks, assumptions and open question
Uncontrolled imports could couple every module. Assumed: No application dependencies are pinned in the inspected repository.

## Reconsideration trigger
Revisit extraction when independent scaling, team ownership and a stable event boundary are demonstrated. The architecture lead owns review and approval.

## References
[System architecture](../12-system-architecture.md), [Nest.js application design](../13-nestjs-backend-design.md).
