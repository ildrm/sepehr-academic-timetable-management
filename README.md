# University Academic Management System

Sepehr is a Persian, right-to-left academic portal. The repository contains a Next.js App Router frontend, a Nest.js API, Prisma/PostgreSQL migrations, a BullMQ worker and a Python OR-Tools CP-SAT process. The implementation uses the [academic specification](docx/README.md). The [implementation report](implementation/README.md) describes verified workflows and release gaps.

## Run locally

Use Node.js 24 LTS, Python 3.12, Docker Compose, and OpenSSL. Run these commands at the repository root.

```sh
bash infra/local/configure.sh
set -a
. ./.env
set +a
docker compose -p teaching-implementation -f infra/local/compose.yaml up -d --wait
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
python3.12 -m venv .venv
.venv/bin/python -m pip install -r services/solver/requirements.txt
```

Start the API, worker and web frontend in separate terminals, each with the environment exported.

```sh
set -a
. ./.env
set +a
npm run api
```

Use `npm run worker` and `npm run web` in the other two terminals. Open [the portal](http://localhost:3000). Sign in with `student.demo`, `student.second`, `planner.demo`, `approver.demo`, `office.demo`, or `instructor.demo`. The password is the generated `DEV_BOOTSTRAP_PASSWORD` in your ignored `.env` file. The seed refuses to run against any database name outside the explicit development and test allowlist.

Supported journeys include course bundle search and preferences, registration receipts, atomic swaps and drops, waitlist offers, degree progress, batch allocation, staged exceptions, solver submissions, and independent timetable validation, publication and repair. The local seed supplies a synthetic academic policy. See [configuration and launch gates](implementation/BLOCKERS.md).

## Prepare a production deployment

The release package includes an application image definition, restricted service roles, a controlled migration command, HTTPS identity and provider settings, and health and monitoring endpoints. Use the approved institutional configuration and the [production deployment runbook](infra/deployment/README.md).

## Validate

```sh
npm run lint
npm run typecheck
npm test
npm run build
.venv/bin/python -m unittest services.solver.test_solve services.solver.test_allocate
```

Run `bash infra/local/integration.sh` with `DATABASE_URL` pointing at a fresh isolated `academic_test` or `academic_test_<suffix>` database and `QUEUE_REDIS_URL` pointing at local Redis. The script runs migrations, seeds the test schema and starts the API and worker on a separate port. Set `SOLVER_PYTHON` to the virtual-environment Python. To exercise the built website with Playwright, install Chromium with `npx playwright install chromium` and run `bash infra/local/browser.sh` against a different fresh test database. Set `BROWSER_CHANNEL=chrome` to use installed Chrome. The browser test writes screenshots only when `E2E_SCREENSHOT_DIR` is set.

See the [validation results](implementation/VALIDATION_REPORT.md) and [coverage matrix](implementation/REQUIREMENTS_COVERAGE.csv).
