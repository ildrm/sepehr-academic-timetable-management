# University academic management system

**Design release 0.1 · 22 November 2026.** Start with the [scope and release criteria](source/00-overview-scope.md) or its [Word edition](word/00-overview-scope.docx). The suite contains 35 chapters and 12 architecture decision records (ADRs), each in English Markdown and Word. Product workflows target Persian and right-to-left layout. Keep the directory intact when sharing Word files so links to adjacent documents and technical artifacts resolve.

## Choose a reading path

| Reader | Recommended sequence |
|---|---|
| Managers | [Product outcomes](source/01-product-requirements.md) → [delivery roadmap](source/30-roadmap-backlog-delivery.md) → [open decisions](source/32-risks-assumptions-open-decisions.md) |
| Developers | [Architecture](source/12-system-architecture.md) → [data dictionary](source/15-data-model-dictionary.md) → [transactions](source/17-transactions-consistency.md) → [API contract](artifacts/openapi.yaml) |
| Testers | [Use cases](source/02-software-requirements-use-cases.md) → [verification strategy](source/21-test-verification-strategy.md) → [traceability matrix](artifacts/traceability.csv) → [Given/When/Then scenarios](artifacts/test-scenarios.yaml) |
| Academic administrators | [Curricula](source/05-academic-domain-curriculum.md) → [rules](source/06-academic-rule-engine.md) → [waitlists](source/09-enrollment-waitlist.md) → [office guide](source/29-education-admin-user-guide.md) |
| Timetable planners | [Resource inputs](source/08-faculty-resources-offerings.md) → [solver and validation](source/10-timetabling-optimization.md) → [planner guide](source/28-faculty-planner-user-guide.md) |
| Students and advisors | [Student guide](source/27-student-user-guide.md) → [schedule suggestions and degree progress](source/11-student-scheduling-degree-audit.md) |

## What the evidence establishes

**Confirmed.** Read-only inspection of commit `5ed0322` found a tracked README and GPL license. The working tree was clean and had no application code, dependency pins, institutional policy or prior documentation directory. The repository supplies no conflicting implementation decision. The [manifest](MANIFEST.json) identifies every document, its owner, dependencies, hashes, generation status, content approval and layout evidence.

**Proposed.** Next.js App Router and TypeScript provide the interface and thin BFF. Nest.js and TypeScript own academic decisions in a modular monolith. PostgreSQL and Prisma support the transactional core with reviewed SQL for guards. Redis provides a disposable cache and separate non-evicting BullMQ job storage. A Python OR-Tools CP-SAT solver proposes timetables. REST/OpenAPI and a transactional outbox link components. The proposed baseline supports one institution with multiple faculties. None of these application dependencies was pinned by repository evidence. Technical references include the scope and version of each consulted source. [Source register](references/sources.json)

**Needs approval.** The registrar and academic policy owner must ratify credit and repeat rules, exception authority, minimum-credit stage and fair queue priority. The planning lead must confirm hard cohort constraints, tie-breaks and optimization weights. Product and privacy owners must establish jurisdiction, timezone and retention. Operations must measure representative peak loads and restore drills before adopting numerical targets. These are operational acceptance gates. [Decision register](artifacts/risks-assumptions-decisions.csv)

The [validation report](VALIDATION_REPORT.md) records document and schema checks, the isolated SQL load, page review and unexecuted runtime tests. The [execution state](EXECUTION_STATE.json) lists actual files and open work. The academic fixtures are synthetic. No institution has approved this design.

## Build and check a release

Run from the repository root using Python 3.12 or later. Keep the virtual environment outside the suite. The tooling reads local design inputs and requires no institution account or database connection.

```sh
python3 -m venv /tmp/university-docs-venv
/tmp/university-docs-venv/bin/python -m pip install -r docx/tools/requirements.txt
/tmp/university-docs-venv/bin/python docx/tools/build_docs.py
/tmp/university-docs-venv/bin/python docx/tools/validate_docs.py
```

The build reads Markdown and diagram YAML, writes PNG diagrams and Word documents and regenerates the manifest. It supports the heading, table, code block, hyperlink and figure syntax used by this suite. Diagram rendering looks for Arial or DejaVu Sans. Set `DOCS_FONT` and `DOCS_FONT_BOLD` to installed TrueType paths if needed. Word formatting requests Arial. No fonts are distributed.

The validator checks schemas, contracts, links, table ownership, states, traceability and package structure. It compares document and SQL hashes against the supplied evidence. A changed Word file requires another visual inspection. To repeat rendering with LibreOffice and Poppler, use a fresh temporary output directory:

```sh
mkdir -p /tmp/university-docs-review/pdf
soffice --headless --convert-to pdf --outdir /tmp/university-docs-review/pdf docx/word/*.docx docx/word/adr/*.docx
pdftoppm -png -r 120 /tmp/university-docs-review/pdf/00-overview-scope.pdf /tmp/university-docs-review/overview
```

Inspect every changed document page by page, including table continuations, Persian text, diagram labels and page endings. Preserve reviewed images under validation/evidence and record the corresponding document hash and page count before rerunning validation. The validator uses existing SQL execution evidence. Rechecking changed SQL requires a fresh isolated scratch database and new evidence for that exact file. See the [change history](CHANGELOG.md).

## Chapter index

| ID | Markdown | Word |
|---|---|---|
| DOC-00 | [Academic management system](source/00-overview-scope.md) | [Word](word/00-overview-scope.docx) |
| DOC-01 | [Product requirements](source/01-product-requirements.md) | [Word](word/01-product-requirements.docx) |
| DOC-02 | [Requirements and use cases](source/02-software-requirements-use-cases.md) | [Word](word/02-software-requirements-use-cases.docx) |
| DOC-03 | [Delivery responsibilities](source/03-team-roles-raci.md) | [Word](word/03-team-roles-raci.docx) |
| DOC-04 | [Product roles and permissions](source/04-user-roles-permissions.md) | [Word](word/04-user-roles-permissions.docx) |
| DOC-05 | [Academic domain and curriculum](source/05-academic-domain-curriculum.md) | [Word](word/05-academic-domain-curriculum.docx) |
| DOC-06 | [Academic rule evaluation](source/06-academic-rule-engine.md) | [Word](word/06-academic-rule-engine.docx) |
| DOC-07 | [Calendar and academic workflows](source/07-calendar-state-workflows.md) | [Word](word/07-calendar-state-workflows.docx) |
| DOC-08 | [Instructors, resources and offerings](source/08-faculty-resources-offerings.md) | [Word](word/08-faculty-resources-offerings.docx) |
| DOC-09 | [Enrollment and waitlists](source/09-enrollment-waitlist.md) | [Word](word/09-enrollment-waitlist.docx) |
| DOC-10 | [Timetabling optimization](source/10-timetabling-optimization.md) | [Word](word/10-timetabling-optimization.docx) |
| DOC-11 | [Student planning and degree audit](source/11-student-scheduling-degree-audit.md) | [Word](word/11-student-scheduling-degree-audit.docx) |
| DOC-12 | [System architecture](source/12-system-architecture.md) | [Word](word/12-system-architecture.docx) |
| DOC-13 | [Nest.js application design](source/13-nestjs-backend-design.md) | [Word](word/13-nestjs-backend-design.docx) |
| DOC-14 | [Next.js frontend and user experience](source/14-nextjs-frontend-ux.md) | [Word](word/14-nextjs-frontend-ux.docx) |
| DOC-15 | [Academic data dictionary](source/15-data-model-dictionary.md) | [Word](word/15-data-model-dictionary.docx) |
| DOC-16 | [API contracts and errors](source/16-api-contracts-errors.md) | [Word](word/16-api-contracts-errors.docx) |
| DOC-17 | [Registration transactions](source/17-transactions-consistency.md) | [Word](word/17-transactions-consistency.docx) |
| DOC-18 | [Events, jobs and integrations](source/18-events-jobs-integrations.md) | [Word](word/18-events-jobs-integrations.docx) |
| DOC-19 | [Security and privacy](source/19-security-privacy-threat-model.md) | [Word](word/19-security-privacy-threat-model.docx) |
| DOC-20 | [Performance and capacity](source/20-nfr-performance-capacity.md) | [Word](word/20-nfr-performance-capacity.docx) |
| DOC-21 | [Test and verification strategy](source/21-test-verification-strategy.md) | [Word](word/21-test-verification-strategy.docx) |
| DOC-22 | [Deployment and change control](source/22-devops-deployment.md) | [Word](word/22-devops-deployment.docx) |
| DOC-23 | [Observability and academic reports](source/23-observability-reporting.md) | [Word](word/23-observability-reporting.docx) |
| DOC-24 | [Recovery and incident runbooks](source/24-backup-disaster-recovery-runbooks.md) | [Word](word/24-backup-disaster-recovery-runbooks.docx) |
| DOC-25 | [Data migration and reconciliation](source/25-data-migration-quality.md) | [Word](word/25-data-migration-quality.docx) |
| DOC-26 | [Persian interface, accessibility and time](source/26-i18n-accessibility-time.md) | [Word](word/26-i18n-accessibility-time.docx) |
| DOC-27 | [Student guide](source/27-student-user-guide.md) | [Word](word/27-student-user-guide.docx) |
| DOC-28 | [Instructor and timetable planner guide](source/28-faculty-planner-user-guide.md) | [Word](word/28-faculty-planner-user-guide.docx) |
| DOC-29 | [Academic office guide](source/29-education-admin-user-guide.md) | [Word](word/29-education-admin-user-guide.docx) |
| DOC-30 | [Delivery roadmap and backlog](source/30-roadmap-backlog-delivery.md) | [Word](word/30-roadmap-backlog-delivery.docx) |
| DOC-31 | [Extension modules](source/31-extension-modules.md) | [Word](word/31-extension-modules.docx) |
| DOC-32 | [Risks and open decisions](source/32-risks-assumptions-open-decisions.md) | [Word](word/32-risks-assumptions-open-decisions.docx) |
| DOC-33 | [Traceability and delivery gates](source/33-quality-review-traceability.md) | [Word](word/33-quality-review-traceability.docx) |
| DOC-34 | [Glossary and maintenance](source/34-glossary-references-maintenance.md) | [Word](word/34-glossary-references-maintenance.docx) |

## Architecture decisions

| ID | Markdown | Word |
|---|---|---|
| ADR-001 | [One modular academic core](source/adr/adr-001-modular-architecture.md) | [Word](word/adr/adr-001-modular-architecture.docx) |
| ADR-002 | [Thin browser-facing backend](source/adr/adr-002-bff-boundary.md) | [Word](word/adr/adr-002-bff-boundary.docx) |
| ADR-003 | [PostgreSQL owns academic facts](source/adr/adr-003-data-ownership.md) | [Word](word/adr/adr-003-data-ownership.docx) |
| ADR-004 | [Prisma with reviewed SQL paths](source/adr/adr-004-orm-sql.md) | [Word](word/adr/adr-004-orm-sql.docx) |
| ADR-005 | [Ordered database guards](source/adr/adr-005-isolation-locking.md) | [Word](word/adr/adr-005-isolation-locking.docx) |
| ADR-006 | [Durable command outcomes](source/adr/adr-006-idempotency.md) | [Word](word/adr/adr-006-idempotency.docx) |
| ADR-007 | [Recoverable event delivery](source/adr/adr-007-transactional-outbox.md) | [Word](word/adr/adr-007-transactional-outbox.docx) |
| ADR-008 | [Separate cache and job storage](source/adr/adr-008-cache-queue-separation.md) | [Word](word/adr/adr-008-cache-queue-separation.docx) |
| ADR-009 | [Solver as a proposal producer](source/adr/adr-009-independent-solver.md) | [Word](word/adr/adr-009-independent-solver.docx) |
| ADR-010 | [Pin academic decisions to versions](source/adr/adr-010-versioning.md) | [Word](word/adr/adr-010-versioning.docx) |
| ADR-011 | [Scoped, time-bounded assignments](source/adr/adr-011-authorization.md) | [Word](word/adr/adr-011-authorization.docx) |
| ADR-012 | [Decision instants and local recurrence](source/adr/adr-012-time-semantics.md) | [Word](word/adr/adr-012-time-semantics.docx) |
