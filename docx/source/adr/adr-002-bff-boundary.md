# Thin browser-facing backend

ADR-002 · Version 0.1 · proposed · Owner: Frontend lead

**Purpose and scope** — Decide how to address the following design pressure. Session handling and Persian UI orchestration belong near the web layer.

**Audience** — Frontend lead, implementation leads and quality reviewers.

**Dependencies** — [System architecture](../12-system-architecture.md), [Next.js frontend and user experience](../14-nextjs-frontend-ux.md).

## Alternatives and decision
Direct browser/API access exposes more session integration. Duplicating academic decisions in Next.js risks divergent eligibility.

Use Next.js App Router for rendering and a thin BFF. Forward verified actor context to Nest.js for every authoritative decision.

## Rationale and consequences
A single policy implementation gives the browser, staff tools and workers consistent outcomes. Server Actions and Route Handlers use a generated client. Web processes have no academic database write credentials.

## Risks, assumptions and open question
Caching a personal response could expose another student. Assumed: No application dependencies are pinned in the inspected repository.

## Reconsideration trigger
Revisit session propagation when non-browser clients or federated identity add new trust boundaries. The frontend lead owns review and approval.

## References
[System architecture](../12-system-architecture.md), [Next.js frontend and user experience](../14-nextjs-frontend-ux.md).
