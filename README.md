<div align="center">

# Sepehr - University Academic Management & Timetable Optimization

### Open-Source University Academic Management & Timetable Optimization

**A Persian-first, right-to-left academic portal for university course registration, enrollment, waitlists, degree planning, batch seat allocation, and constraint-based scheduling.**

[![CI](https://github.com/ildrm/teaching-system/actions/workflows/ci.yaml/badge.svg)](https://github.com/ildrm/teaching-system/actions/workflows/ci.yaml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=nodedotjs&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](package.json)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](services/solver/requirements.txt)

[Features](#capabilities) · [Architecture](#architecture) · [Quick start](#quick-start) · [API](#api-and-integration-contracts) · [Testing](#testing-and-validation) · [Deployment](#production-deployment) · [Documentation](#documentation-map)

</div>

> [!IMPORTANT]
> **Release status: institutional release candidate, not a production-approved university system.** As documented in the [22 November 2026 validation report](implementation/VALIDATION_REPORT.md), the application passed a set of *local, synthetic* tests and packaging checks. Real institutional policies, identity integration, infrastructure, privacy requirements, representative load testing, accessibility acceptance, and operational sign-off remain outstanding. **Do not use synthetic policies or development credentials with real student data.** See [Release gates](#release-readiness-and-known-limitations).

## Overview

**Sepehr** is an academic information and operations system intended to connect students, academic offices, instructors, timetable planners, and authorized administrators within one institution and its faculties. Its purpose is to make **academic decisions consistent, traceable, and safe under concurrency**—especially when multiple students compete for limited seats or schedules change during a registration period.

Unlike a conventional **learning management system (LMS)**, Sepehr focuses on **academic administration**, not delivering video lectures, online assignments, quizzes, or discussion forums. It is also **not yet a complete student ERP**: tuition, examination management, production transcripts, and LMS integrations are outside the current approved implementation scope.

The codebase combines a **Next.js App Router web application**, a **NestJS API**, a **PostgreSQL transactional domain**, a **BullMQ background worker**, and **Python OR-Tools CP-SAT solvers**. The web interface is designed for **Persian (فارسی)**, **RTL layouts**, and localized academic date/time presentation.

### What makes it different?

- **Transaction-safe course registration:** seat claims, prerequisite and co-requisite checks, capacity checks, drops, and swaps operate through guarded database transactions.
- **Academic policies as versioned decisions:** rule evaluation provides explicit outcomes and reasons rather than silent, best-effort validation.
- **Durable enrollment requests:** idempotency keys, receipts, database-backed events, and recovery paths help avoid duplicate or ambiguous outcomes after retries.
- **Waitlist lifecycle:** ordered queue processing, time-bounded offers, acceptance/rejection, and worker recovery.
- **Schedule optimization with independent review:** a solver proposes timetables, but the application separately validates and controls their publication and repair.
- **Fairness-aware batch allocation:** bounded CP-SAT allocation supports academic priority tiers, credits, reserve constraints, and deterministic tie-breaking.
- **Persian-first experience:** right-to-left screens for students and staff, with Persian labels and Persian-calendar presentation where implemented.
- **Design traceability:** the repository includes 35 specification chapters, 12 architecture decision records (ADRs), schemas, diagrams, an OpenAPI baseline, requirement mappings, and validation evidence.

## Screenshots

The repository includes screenshots captured from the tested Persian portal. These are **development/test evidence**, not representations of a live institutional deployment.

| Desktop student portal | Mobile student portal |
| --- | --- |
| ![Sepehr desktop student portal screenshot](implementation/evidence/release/student-desktop.png) | ![Sepehr mobile RTL student portal screenshot](implementation/evidence/release/student-mobile.png) |

Additional browser evidence is retained in [`implementation/evidence/release/`](implementation/evidence/release/).

## Capabilities

The following matrix distinguishes **implemented workflows** from **operational acceptance**. “Implemented” means code exists and is represented in the repository's local validation evidence; it does **not** mean the workflow is approved for live university data.

| Area | Included workflows | Current boundary |
| --- | --- | --- |
| **Identity and permissions** | Development sign-in; institutional OIDC authorization-code flow with PKCE; session management; staff authentication assurance; faculty/term-scoped roles | Live identity-provider integration and provisioning require institutional verification |
| **Academic catalog and setup** | Organizational units, academic programs, courses, terms, offerings, rooms, curricula, policy revisions and controlled approvals | Real institutional master data and policies must be approved |
| **Course registration** | Search offerings, select class/component bundles, preview outcomes, enroll, drop, swap, finalize and view receipts | Real credit, repeat, standing, and enrollment policies need ratification |
| **Registration safeguards** | Prerequisites, co-requisites, schedule/room constraints, seat claims, waitlist precedence, version checks and transaction guards | Representative edge cases and performance under institutional load remain to be exercised |
| **Waitlists** | Join queues; generate time-limited offers; accept or reject; recover worker processing | Live fairness tiers and reserved-seat policies need approval |
| **Timetable management** | Input snapshots, manual proposals, solver runs, independent validation, versioned publication, impact reviews and controlled repairs | Authoritative resource, travel, cohort and teaching-pattern data are incomplete |
| **Batch seat allocation** | Campaign creation and approval, preference alternatives, optimization, revalidation and atomic publication | Solver is deliberately bounded; institutional fairness and appeals need sign-off |
| **Student planning** | Preference-based course suggestions, degree-audit credits and evidence tied to records and versions | Suggestion search is bounded; institution-specific degree cases remain |
| **Academic office** | Exception requests/decisions, record corrections, registration windows, capacity operations and constrained imports | Broader correction and delegated workflows need additional acceptance tests |
| **Instructor view** | Workload/assignment visibility and submitted availability windows | Scope is not a full HR or faculty-management system |
| **Reporting** | Seat utilization, unmet demand, timetable disruption, audits and scoped CSV exports | Privacy thresholds, disclosure policies and retention need approval |
| **Operations** | Health/metrics endpoints, background jobs, durable outbox, deployment configuration, backups and recovery checks | Production resilience, recovery targets, external-provider and load tests are not complete |

For requirement-by-requirement detail, see the [implementation coverage matrix](implementation/REQUIREMENTS_COVERAGE.csv), [scope map](implementation/SCOPE.md), and [verification report](implementation/VALIDATION_REPORT.md).

### Who uses Sepehr?

| Role / audience | Typical responsibilities |
| --- | --- |
| **Student** | Explore the catalog, plan courses, register or change enrollments, respond to waitlist offers, follow degree progress, request exceptions and submit allocation preferences |
| **Instructor** | Review assignments/workload and submit availability |
| **Timetable planner** | Prepare resource inputs, submit and compare proposals, run optimization, inspect impacts and coordinate publication |
| **Academic office / registrar staff** | Review exceptions, process scoped academic records, manage registration windows and oversee student operations |
| **Academic approver / department authority** | Independently approve controlled changes and review authorized academic reports |
| **Operations / identity administrators** | Manage institutional identity bindings, secure service deployment, observability and recovery |

Actual access is determined by **time-bounded, scoped role assignments** in the data model. The synthetic accounts below are strictly for local demonstration; they do not imply interchangeable production privileges.

## Architecture

Sepehr uses a **modular academic core**. PostgreSQL owns authoritative academic facts; the browser does not perform eligibility or capacity decisions. The Python solvers return **proposals** rather than directly changing academic records.

```mermaid
flowchart TB
    Browser["Student & staff browsers<br/>Persian / RTL"]
    Web["Next.js App Router<br/>Portal + same-origin BFF"]
    API["NestJS API<br/>Identity · registration · planning · reports"]
    Core["Academic domain services<br/>Policy · enrollment · timetable · allocation"]
    DB[("PostgreSQL 17<br/>Academic truth · receipts · event outbox")]
    Queue[("Redis / BullMQ<br/>Background jobs")]
    Worker["Node.js worker<br/>Queue and outbox processing"]
    Solver["Python / OR-Tools CP-SAT<br/>Timetable & batch allocation"]
    IdP["Institutional OIDC provider<br/>Production identity"]
    Notify["Approved HTTPS notification gateway<br/>Optional"]

    Browser -->|"/api/* requests"| Web
    Web --> API
    API --> Core
    Core <--> DB
    API --> Queue
    Worker <--> DB
    Worker <--> Queue
    Worker --> Solver
    Solver --> Worker
    API <-->|"OIDC"| IdP
    Worker -.->|"Signed idempotent delivery"| Notify
```

### Technology stack

| Layer | Technologies | Responsibility |
| --- | --- | --- |
| Web frontend | **Next.js 16**, **React 19**, **TypeScript**, Lucide icons | Persian RTL portal, dashboard and interaction flows |
| Browser-facing API boundary | Next.js route handler | Same-origin forwarding of authenticated requests to the internal API |
| Backend | **NestJS 11**, Express, TypeScript, Zod | HTTP endpoints, validation, authorization and academic workflows |
| Core persistence | **PostgreSQL 17**, **Prisma 7**, reviewed SQL | Transactions, referential integrity, capacity claims, versioning, receipts and audits |
| Jobs and orchestration | **Redis 7.4**, **BullMQ 5**, Node.js worker | Background processing, waitlist work, outbox consumption and solver leases |
| Timetable and allocation | **Python 3.12**, **Google OR-Tools CP-SAT** | Constraint-based proposals, objectives and bounded seat allocation |
| Identity / integration | OpenID Connect, PKCE, optional HTTPS notifications | Institutional sign-in and recoverable external delivery |
| Validation | Node test runner, integration tests, Python `unittest`, **Playwright**, ESLint, TypeScript | Unit, database, concurrency, solver, browser and release verification |
| Packaging | Docker Compose, multi-stage Dockerfile, GitHub Actions | Local dependencies, controlled release packaging and automated checks |

Direct dependency versions are pinned by [`package-lock.json`](package-lock.json) and [`services/solver/requirements.txt`](services/solver/requirements.txt); the versions above describe the reviewed repository snapshot, not an evergreen compatibility guarantee.

### Transaction integrity and reliability

**Enrollment changes** are evaluated against the student's proposed **final course set** inside PostgreSQL transactions. The implementation uses ordered locks/guards around the academic term, student state and capacity pools; failures roll back dependent claims. Registration operations also maintain request identity, receipts and audit/event records.

**Waitlist, solver and external delivery work** use recoverable worker flows. Redis transports job work, while PostgreSQL is the durable authority for academic decisions, event records and processing evidence. When an outcome is uncertain, clients should **query request status using the original idempotency key** rather than blindly creating a second request.

**Timetables** are versioned. A solver result is not automatically authoritative: proposals are validated against constraints, reviewed (including impact analysis for changes to an active term), and then published through controlled paths. Stale inputs and changed enrollment/capacity state must be rechecked before publication.

See [architecture decisions](docx/README.md#architecture-decisions), [transaction design](docx/source/17-transactions-consistency.md), [background operations](implementation/OPERATIONS.md) and [implementation decisions](implementation/DECISIONS.md).

### Solver boundaries

- **Timetable CP-SAT:** accepts versioned, schema-validated input; includes scheduling conflicts, selected incompatibilities, workload caps and preference objectives. The current process rejects inputs beyond **250 classes** or **2,500 candidate placements**.
- **Batch allocation CP-SAT:** supports approved campaigns and ranked alternatives with academic priority/credit objectives, capacity and reserved seats. The implemented campaign limit is **64 applicants** and **four alternatives per applicant** (up to eight bundles per alternative).
- **Course suggestions:** accept up to **five ordered preferences** and examine a bounded set of up to **32 candidate additions**. Suggestions are **not seats or enrollment reservations**.
- **Solver outcomes:** feasible, infeasible and inconclusive runs must be handled distinctly. Time-bounded solving does not guarantee a solution for every possible institutional dataset.

Institutional scheduling quality and acceptable computational limits require benchmarking on representative inputs; local solver tests alone do not establish live capacity.

## Repository structure

```text
teaching-system/
├── apps/
│   ├── web/                    # Next.js Persian RTL portal and same-origin BFF
│   ├── api/                    # NestJS HTTP API, identity and release preflight
│   └── workers/                # BullMQ, outbox, waitlist and solver orchestration
├── packages/
│   ├── backend-core/           # Academic domain operations and policies
│   └── contracts/              # Runtime contract handling
├── prisma/
│   ├── schema.prisma           # Academic PostgreSQL data model
│   └── migrations/             # Versioned schema migrations
├── services/
│   └── solver/                 # Python OR-Tools timetable and allocation solvers
├── infra/
│   ├── local/                  # Local Compose, seed and integration tooling
│   └── deployment/             # Release image, role grants and runbooks
├── tests/
│   ├── unit/                   # Domain / security / configuration tests
│   ├── integration/            # Real PostgreSQL and Redis workflows
│   ├── e2e/                    # Playwright browser journeys
│   └── fixtures/               # Synthetic academic records and policies
├── implementation/            # Build status, coverage, release gates, evidence
├── docx/                      # 35-chapter design, 12 ADRs, schemas and Word docs
├── .github/workflows/ci.yaml  # Continuous validation
├── .env.example               # Development environment template
└── package.json               # Root scripts and dependencies
```

## Quick start

> [!NOTE]
> These instructions create a **local development instance** backed by **fictional academic records**. The included shell scripts target Bash on Linux, macOS, or Windows through **WSL2**. Windows PowerShell alone cannot run the Bash scripts or `.venv/bin/python` commands unchanged.

### Prerequisites

- **Node.js 24 LTS** and npm (the root package allows Node `>=24 <27`, with 24 the documented deployment target)
- **Python 3.12** and `venv`
- **Docker Engine / Docker Desktop with Compose v2**
- **OpenSSL**, Git and Bash
- A machine capable of running PostgreSQL, Redis, Node.js and the Python solver locally

### 1. Clone the project

```bash
git clone https://github.com/ildrm/teaching-system.git
cd teaching-system
```

### 2. Generate a secure local configuration

```bash
bash infra/local/configure.sh
```

This creates a **git-ignored `.env`** containing randomly generated development database credentials, a demonstration-user password and a cursor-signing secret. Existing `.env` files are not overwritten.

**Do not commit `.env`, development passwords or provider secrets.** The tracked [`.env.example`](.env.example) is a reference, not a deployable production configuration.

Load the generated values into the current Bash shell:

```bash
set -a
. ./.env
set +a
```

### 3. Start the local infrastructure

```bash
docker compose -p teaching-implementation -f infra/local/compose.yaml up -d --wait
```

The local Compose file starts:

| Service | Development endpoint | Notes |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:55432` | Database `academic_local`, persistent named volume |
| Queue Redis | `127.0.0.1:56379` | AOF persistence and `noeviction`; used for jobs |
| Cache Redis | `127.0.0.1:56380` | Disposable cache service; separate from the queue |

Ports are **loopback-bound** for local work. These settings are not a production network design.

### 4. Install dependencies and initialize the database

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed installs **synthetic** terms, courses, academic policies, people, scoped roles and sample schedules. It deliberately refuses to operate against database names outside `academic_local`, `academic_test`, or `academic_test_<suffix>`, and requires explicit development-only flags.

### 5. Install the Python solvers

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r services/solver/requirements.txt
```

The generated `.env` points `SOLVER_PYTHON` to `.venv/bin/python`. If your local Python interpreter path differs, adjust **only your local ignored environment file**.

### 6. Start the API, worker and web portal

Run the following in **three separate terminals** from the repository root. In each terminal, load the environment first:

```bash
set -a
. ./.env
set +a
```

**Terminal A — API**

```bash
npm run api
```

**Terminal B — worker**

```bash
npm run worker
```

**Terminal C — web**

```bash
npm run web
```

Open **http://localhost:3000**. The development API defaults to `http://127.0.0.1:4100` and is reached through the frontend's same-origin `/api/*` proxy.

### Development demo accounts

The synthetic seed provides these example logins:

| Login | Demonstration purpose |
| --- | --- |
| `student.demo` | Student registration and degree progress |
| `student.second` | A second student and concurrent enrollment scenarios |
| `student.arts` | A student from another faculty |
| `instructor.demo` | Instructor availability and assignments |
| `planner.demo` | Scheduling, capacity and allocation workflows |
| `approver.demo` | Independently authorized academic approvals |
| `office.demo` | Academic office workflows |

All accounts use the **generated `DEV_BOOTSTRAP_PASSWORD` in your local `.env`**. Development sign-in is restricted to the configured development environment and must never be enabled in production.

## Configuration reference

### Local application variables

| Variable | Purpose | Typical local setting |
| --- | --- | --- |
| `APP_ENV` | Application operating mode | `development` |
| `ENABLE_DEVELOPMENT_AUTH` | Enables the synthetic username/password flow in development | `true` |
| `ALLOW_SYNTHETIC_SEED` | Allows guarded fixture seeding | `true` |
| `DATABASE_URL` | PostgreSQL connection string | Generated by `infra/local/configure.sh` |
| `LOCAL_DB_PASSWORD` | Local Compose database password | Generated secret |
| `DEV_BOOTSTRAP_PASSWORD` | Password for synthetic demo accounts | Generated secret |
| `CURSOR_SECRET` | Key material for signed application cursors | Generated secret |
| `WEB_ORIGIN` | Exact browser origin used in request checks | `http://localhost:3000` |
| `INTERNAL_API_URL` | Server-to-server URL used by Next.js forwarding | `http://127.0.0.1:4100` |
| `API_HOST` / `API_PORT` | Local HTTP listener | `127.0.0.1` / `4100` |
| `COOKIE_SECURE` | Secure-cookie requirement | `false` only for loopback HTTP development |
| `QUEUE_REDIS_URL` | Redis instance for BullMQ | `redis://127.0.0.1:56379` |
| `SOLVER_PYTHON` | Python executable used by the worker | `.venv/bin/python` |
| `SOLVER_LIMIT_SECONDS` | Maximum solver time budget | `5` in local example |
| `REQUEST_RETENTION_HOURS` | Request/receipt retention configuration | `72` in local example |
| `REPORT_MIN_CELL` | Positive minimum-cell threshold for CSV suppression | Choose a development value for report testing (the integration script uses `2`) |

### Institutional identity and security settings

Production requires an approved **HTTPS origin**, a configured OIDC issuer/client, an accepted staff authentication context (`OIDC_STAFF_ACR`), secure cookies and controlled credentials. The implementation also supports `*_FILE` secrets for sensitive settings, including database URLs, Redis connection, OIDC client secret and cursor secret.

The deployed container definitions use **separate database identities** for API, worker and migration roles, and a **TLS-verified `rediss://`** queue. Relevant settings include `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (or its file), `OIDC_STAFF_ACR`, `QUEUE_NAME`, `QUEUE_REDIS_URL`, `COOKIE_SECURE`, `REQUEST_RETENTION_HOURS`, `REPORT_MIN_CELL`, and `SOLVER_LIMIT_SECONDS`.

Do **not** copy the development `.env` into an institutional deployment. Use the [production configuration template](infra/deployment/config.example.env) and [deployment runbook](infra/deployment/README.md), which define stricter requirements than this quick-start guide.

## API and integration contracts

The NestJS API is intended to be accessed from the browser through the Next.js **same-origin** `/api/*` boundary. The server publishes a checked-in OpenAPI baseline and additional documented implementation endpoints:

- **OpenAPI artifact:** [`docx/artifacts/openapi.yaml`](docx/artifacts/openapi.yaml)
- **Runtime OpenAPI endpoint:** `GET /openapi.yaml` on the **internal NestJS API**
- **Additional endpoint contracts:** [`implementation/EXTENDED_API.md`](implementation/EXTENDED_API.md)
- **Contracts and error model:** [`docx/source/16-api-contracts-errors.md`](docx/source/16-api-contracts-errors.md)

> [!IMPORTANT]
> The checked-in OpenAPI specification describes **14 baseline operations**. The additional implemented routes are documented separately and still require formal specification adoption. Do not assume the OpenAPI file fully enumerates every current API method.

### Endpoint groups (selected examples)

| Domain | Example internal API routes | Purpose |
| --- | --- | --- |
| Session | `GET /session/config`, `GET /session/oidc/start`, `POST /session/logout` | Available sign-in mode, institutional OIDC and logout |
| Student portal | `GET /me/portal`, `GET /me/overview/:termId` | Profile and student term overview |
| Catalog and planning | `GET /me/catalog/:termId`, `GET /me/suggestions/:termId`, `GET /me/degree/:termId` | Course discovery, suggestions and degree audit |
| Enrollment | `POST /me/enrollment-previews`, `POST /me/enrollments`, `POST /me/drops`, `POST /me/swaps` | Preflight, registration and changes |
| Request tracking | `GET /me/requests/:operation/:key` | Inspect durable command outcomes |
| Waitlists | `POST /me/waitlist-entries`, `POST /me/waitlist-entries/:entryId/responses` | Queue participation and offers |
| Timetables | `POST /terms/:termId/snapshots`, `POST /terms/:termId/solve-runs`, `GET /terms/:termId/timetables` | Solver inputs and timetable versions |
| Timetable review | `POST /terms/:termId/timetables/:versionId/validations`, `GET /terms/:termId/timetables/:versionId/impact` | Independent validation and repair impact |
| Allocation | `GET /me/allocations/:termId`, `POST /terms/:termId/allocations`, `POST /terms/:termId/allocations/:campaignId/runs` | Campaigns, preferences and solver runs |
| Academic office | `/me/exceptions/:termId`, `/academic/courses`, `/academic/terms`, `/academic/imports` | Exceptions, master data and imports |
| Reports / audit | `GET /terms/:termId/reports/demand`, `GET /terms/:termId/audit` | Scoped reporting, auditing and CSV exports |
| Health | `GET /health/live`, `GET /health/ready`, `GET /internal/metrics` | Private operations and monitoring |

These paths are a **navigation overview**, not a request-body contract. Access control, scope, CSRF protection, idempotency keys, payload validation and response status vary by route. Use the referenced contracts and DTOs rather than issuing guessed write requests.

### Notifications and external systems

The worker can deliver **minimal, signed HTTPS notifications** through an institution-approved gateway. The opt-in override is in [`infra/deployment/notification.override.yaml`](infra/deployment/notification.override.yaml). Delivery uses an event ID for idempotency and a response receipt contract; transient failures are retried, while unresolved failures require investigation.

This is **not** a bundled email/SMS provider or a completed LMS/finance integration. The gateway, signing configuration, consent and retention rules require institutional approval. See [notification deployment requirements](infra/deployment/README.md#notifications).

## Testing and validation

### Standard project checks

From an initialized environment:

```bash
npm run lint
npm run typecheck
npm test
npm run build
.venv/bin/python -m unittest services.solver.test_solve services.solver.test_allocate
```

The root [`package.json`](package.json) also defines `test:integration` and `test:e2e`. These rely on running services, seeded **isolated test databases**, and additional configuration. Prefer the bundled scripts below rather than running them against your everyday development database.

### PostgreSQL + Redis integration tests

First create a **fresh, isolated** database in the local PostgreSQL container:

```bash
docker compose -p teaching-implementation -f infra/local/compose.yaml \
  exec -T postgres psql -U academic -d postgres \
  -c 'CREATE DATABASE academic_test;'
```

Then run the fixture-based integration harness:

```bash
DATABASE_URL="postgresql://academic:${LOCAL_DB_PASSWORD}@127.0.0.1:55432/academic_test" \
  bash infra/local/integration.sh
```

The harness migrates and seeds the dedicated test database, starts an isolated API/worker pair, configures a distinct queue name and runs the integration suite. **Use a new test database or a carefully reset test fixture for repeat runs.** Do not point the script at institutional data.

### Browser end-to-end tests

First build the web application and install Playwright's Chromium browser:

```bash
npm run build
npx playwright install chromium
```

Create a **different fresh database** for the browser tests:

```bash
docker compose -p teaching-implementation -f infra/local/compose.yaml \
  exec -T postgres psql -U academic -d postgres \
  -c 'CREATE DATABASE academic_test_browser;'

DATABASE_URL="postgresql://academic:${LOCAL_DB_PASSWORD}@127.0.0.1:55432/academic_test_browser" \
  bash infra/local/browser.sh
```

The browser harness starts its own API and built frontend on test ports and covers representative Persian desktop/mobile workflows. Refer to the [browser script](infra/local/browser.sh) for optional browser channel and screenshot settings.

### What was verified in the checked-in release report?

The [22 November 2026 report](implementation/VALIDATION_REPORT.md) records **passed local checks** for:

- ESLint, TypeScript and application production builds.
- Nine Node domain/security unit tests, fourteen PostgreSQL/Redis integration results and six Python solver tests (as reported for that snapshot).
- Concurrent registration and rollback cases, waitlist offers, allocation publication, timetable repairs, scoped reports, and idempotent effects.
- Synthetic HTTPS OIDC authentication, staff assurance, notification signing/retry/receipts, session invalidation and replay prevention.
- Built Next.js desktop/mobile Persian portal journeys in headless Chromium.
- Production Compose parsing, database role grant checks, backup/restore consistency and worker restart recovery.
- A local **Linux ARM64** OCI image with non-root runtime and packaged solver tests.
- A production-dependency npm audit reporting zero advisories **at the time of that local check**.

**Not independently asserted by this README:** a fresh CI run, current dependency security, x86 image validation, production-scale performance, real-provider interoperability, comprehensive accessibility audit, complete failover, or an approved production deployment. Consult the [validation evidence](implementation/evidence/release/) and run tests in your own environment.

### CI pipeline

[`.github/workflows/ci.yaml`](.github/workflows/ci.yaml) declares validation on pushes and pull requests, using PostgreSQL, Redis, Node 24 and Python 3.12. It runs static checks, unit/integration/solver tests, a production build, Playwright Chromium tests and a production dependency audit.

The CI badge at the top of this README reflects the GitHub Actions workflow when GitHub makes its current status available; the historical local validation report is not a substitute for a current passing pipeline.

## Production deployment

Sepehr has a **deployment package and release runbook**, but production activation is intentionally blocked until its university-specific gates are satisfied.

### Prepared deployment assets

- [Multi-stage application Dockerfile](infra/deployment/Dockerfile) for the NestJS API, Next.js app, worker and Python solver.
- [Production Compose definition](infra/deployment/compose.yaml) with individual API, web, worker and migration commands.
- [Database privileges](infra/deployment/privileges.sql) for distinct operational roles.
- [Institutional environment template](infra/deployment/config.example.env), including approved image digest and secret-file paths.
- [Optional signed notification integration](infra/deployment/notification.override.yaml).
- [Monitoring alert templates](infra/deployment/alerts.yaml), deployment preflight and release/restore procedures.

### Required release sequence

1. Obtain sign-off on academic rules, fairness and exceptions; timetabling inputs; privacy and retention; institutional identity; and operational targets.
2. Build and review an **immutable image** for the actual target architecture, publish it through an approved registry, and record its digest.
3. Provision HTTPS ingress, an institutional OIDC provider, a backed-up PostgreSQL instance, authenticated TLS Redis and operator-managed secrets.
4. Apply migrations using the dedicated migration identity; apply and verify least-privilege database grants.
5. Run application preflight, verify institutional policy and identity bindings, then start API, web and worker services.
6. Confirm real SSO, protected staff flows, monitoring, recovery, backup integrity, capacity safeguards and external delivery before enabling registration windows.
7. Record operational acceptance and the ability to halt or roll back safely.

**Authoritative commands and configuration:** [`infra/deployment/README.md`](infra/deployment/README.md). Do not treat `docker compose up` or a passing local smoke test as production authorization.

### Operations endpoints

| Route | Intended use |
| --- | --- |
| `/health/live` | API process liveness |
| `/health/ready` | API/database readiness check |
| `/internal/metrics` | Private operational metrics (latency, errors, queue/outbox and worker signals) |

Keep the internal API, metrics, PostgreSQL and Redis **off public networks**, and use the approved ingress and observability controls described in the runbook.

## Security and privacy model

The implementation includes controls relevant to academic records, but **security readiness requires institutional threat modeling and independent verification**.

- **Authentication:** local synthetic accounts are development-only; production integrates with OIDC, PKCE and validated browser/session binding.
- **Authorization:** role assignments are scoped to academic units and, where relevant, terms and validity periods; staff operations require stronger assurance.
- **Browser protection:** the BFF forwards session context to the internal API; write operations apply origin/CSRF checks and input validation.
- **Consistency and replay:** transaction guards, idempotent request handling, record revisions and event/receipt tracking limit duplicate state changes.
- **Data minimization:** report visibility is scoped; CSV suppression thresholds are configurable; external notification payloads are constrained.
- **Runtime hardening:** the release Compose uses dedicated database roles, non-root containers, read-only filesystems and secret-file mounts.
- **Accountability:** academic changes and exceptional decisions are traceable through persisted audit records and controlled approval paths.

**Still required before real-world operation:** privacy/legal approval, retention schedules, representative penetration and accessibility testing, real identity-provider verification, restore objectives, operational monitoring thresholds and institutional review of all policies. See [Security & threat model](docx/source/19-security-privacy-threat-model.md) and [release gates](implementation/BLOCKERS.md).

## Release readiness and known limitations

As of the repository's **22 November 2026** release evidence, the engineering package is a **release candidate**, not a signed-off institutional installation.

| Area | Open decision or gap |
| --- | --- |
| **Academic policy** | Approve grading, standing, repeat/credit rules, enrollment windows, reserves, queue priorities, fairness and appeals |
| **Identity and roles** | Integrate an actual OIDC issuer, subject bindings, staff authentication context and role lifecycle |
| **Scheduling** | Approve travel/cohort/room/teaching-pattern inputs; run realistic timetable and repair scenarios |
| **Batch allocation** | Validate the current 64-applicant / four-alternative bounds, reserve/priority policies and appeal process against real demand |
| **Privacy and reporting** | Approve audiences, suppression thresholds, retention, audit, delegated exports and disclosure cases |
| **Integrations** | Approve the notification provider contract; learning and finance adapters remain outside activation scope |
| **Operational acceptance** | Complete load and fault testing, point-in-time recovery, provider reconciliation, full role matrix and accessibility review |

### Out of scope / not a complete product today

The current implementation does **not** claim to provide full production support for:

- Online learning content, assignments, quizzes, LMS synchronization or video classrooms.
- Tuition collection, finance reconciliation, staff payroll or compensation.
- Comprehensive exams, attendance tracking, official transcript generation or grade appeals.
- University-wide demand forecasting or unrestricted large-scale allocation.
- Hosted SaaS operations, a public live demo or a universally applicable academic policy.

Some of these are discussed as **proposed extension modules** in the specification, not shipped capabilities. See [`implementation/SCOPE.md`](implementation/SCOPE.md) and [`docx/source/31-extension-modules.md`](docx/source/31-extension-modules.md).

## Documentation map

Sepehr maintains a substantial design and implementation record. Use the following entry points instead of treating the root README as a substitute for complete specifications.

| Resource | Best for |
| --- | --- |
| [Academic documentation index](docx/README.md) | **35 chapters** of product, technical, UX and operations design plus **12 ADRs**, in Markdown and Word |
| [Product requirements](docx/source/01-product-requirements.md) | Objectives, actors and capabilities |
| [Software requirements and use cases](docx/source/02-software-requirements-use-cases.md) | Workflow and behavior detail |
| [Academic rules](docx/source/06-academic-rule-engine.md) | Eligibility, waivers and policy model |
| [Timetable optimization](docx/source/10-timetabling-optimization.md) | CP-SAT inputs, constraints and validation |
| [System architecture](docx/source/12-system-architecture.md) | Boundaries, modules and integration patterns |
| [Data model and dictionary](docx/source/15-data-model-dictionary.md) | Academic entities and persistence design |
| [Security and privacy](docx/source/19-security-privacy-threat-model.md) | Authentication, authorization and threat review |
| [API baseline](docx/artifacts/openapi.yaml) and [additions](implementation/EXTENDED_API.md) | Contracts, scoped HTTP operations and extension status |
| [Requirements coverage](implementation/REQUIREMENTS_COVERAGE.csv) | Implementation status, tests, verification and unresolved gaps |
| [Implementation status](implementation/README.md) | Code/module map and current delivery boundaries |
| [Validation report](implementation/VALIDATION_REPORT.md) | Executed local checks and evidence for the reviewed release |
| [Release gates](implementation/BLOCKERS.md) | Institutional approvals and outstanding tests |
| [Production runbook](infra/deployment/README.md) | Deployment, preflight, TLS, monitoring and recovery |

## Troubleshooting

<details>
<summary><strong>Database seeding refuses to run</strong></summary>

Confirm that `APP_ENV=development`, `ENABLE_DEVELOPMENT_AUTH=true`, and `ALLOW_SYNTHETIC_SEED=true`, and that the database name is one of the explicitly allowed synthetic names. Check that `DEV_BOOTSTRAP_PASSWORD` is configured with at least 16 characters. This restriction is a deliberate safeguard, not a reason to disable the seed guard.

</details>

<details>
<summary><strong>The portal opens but cannot talk to the API</strong></summary>

Confirm the API is running, `INTERNAL_API_URL` matches its address, and `WEB_ORIGIN` matches the exact browser origin (including host and port). The web portal runs at `http://localhost:3000` by default while the internal API runs at `http://127.0.0.1:4100`. Use the web portal rather than accessing the API origin for the browser session.

</details>

<details>
<summary><strong>Worker jobs or timetable solves do not complete</strong></summary>

Check `QUEUE_REDIS_URL`, the queue Redis container, the worker process and `SOLVER_PYTHON`. Ensure the Python virtual environment has the pinned solver dependencies. Inspect worker logs and the persisted request/solver status; do not manually replay an academic operation without checking its receipt and current state.

</details>

<details>
<summary><strong>Integration or browser tests alter my development data</strong></summary>

Tests must target **fresh, isolated** `academic_test...` databases. Check the `DATABASE_URL` passed to `infra/local/integration.sh` or `infra/local/browser.sh` before each run. Do not run these scripts against institutional databases; the synthetic seed has protections, but operators should still isolate test infrastructure.

</details>

<details>
<summary><strong>Production startup rejects my configuration</strong></summary>

This can be expected: production explicitly rejects development authentication/synthetic seeding and requires HTTPS origins, verified PostgreSQL/Redis connections, an OIDC client, staff assurance, signed cursor settings and approved release parameters. Follow the production runbook and institutional preflight rather than disabling validation.

</details>

## Contributing

Contributions that preserve **academic integrity, access control and transactional guarantees** are welcome. Before opening a pull request:

1. Read the [scope map](implementation/SCOPE.md), [implementation decisions](implementation/DECISIONS.md) and relevant [ADRs](docx/README.md#architecture-decisions).
2. Prefer additions that have explicit academic rules, appropriate role/term scope, clear failure states and safe retry behavior.
3. Add or update unit, integration, solver or browser tests appropriate to the change. Concurrent seat allocation and waitlist changes require database-backed tests, not only mocks.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, solver tests and the applicable isolated integration/E2E workflows.
5. Update API/requirements documentation and the coverage matrix when behavior or scope changes. Do not silently convert **proposed institutional policies** into defaults.
6. Never commit secrets, real student information, unreviewed production settings or synthetic fixtures presented as real data.

Use [GitHub Issues](https://github.com/ildrm/teaching-system/issues) for reproducible defects and focused feature discussions, and [Pull Requests](https://github.com/ildrm/teaching-system/pulls) for reviewed changes. There is no claim here of an established maintainer response time or governance model.

## License

The repository includes the **GNU General Public License, Version 2 (GPL v2)**. Read the full [`LICENSE`](LICENSE) before redistributing, modifying or incorporating the software into other products. Third-party dependencies retain their respective licenses.

---

<div align="center">

**Sepehr · سپهر — Academic decisions you can trace. Schedules you can validate.**

[Source code](https://github.com/ildrm/teaching-system) · [Documentation](docx/README.md) · [Implementation status](implementation/README.md) · [Release blockers](implementation/BLOCKERS.md)

</div>
