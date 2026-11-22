# Release validation

22 November 2026. Verification used isolated synthetic databases, local Redis, a synthetic HTTPS identity provider and notification receiver, and the built Next.js portal. The [release gates](BLOCKERS.md) record institutional acceptance and remaining engineering.

| Check | Result | Command and evidence |
|---|---|---|
| Specification integrity | passed | Compared 85 SHA-256 hashes with the documented baseline. [Hash check](evidence/release/specification.log) |
| Static checks | passed | `npm run lint` and `npm run typecheck`. [Lint](evidence/release/lint.log) · [Type check](evidence/release/typecheck.log) |
| Domain and security unit tests | passed | `npm test`. Nine tests covered academic decisions, allocated record evidence, contracts, recurrence, HTTPS configuration and notification receipts. [Unit log](evidence/release/unit.log) |
| Clean PostgreSQL migration and API integration | passed | `bash infra/local/integration.sh` deployed 10 migrations. Fourteen test results passed, including allocation revalidation, timetable repair, reporting scope, real contention, waitlist, Redis jobs and idempotent effects. [Integration log](evidence/release/integration.log) |
| Upgrade from the previous schema | passed | `prisma migrate deploy` applied the four new migrations to a synthetic database populated under the six-migration schema. The checked identity count stayed at eight. [Upgrade log](evidence/release/upgrade.log) |
| Synthetic HTTPS identity and delivery | passed | The integration suite verified PKCE, signed ID token, browser binding, replay rejection, denied staff assurance and session invalidation after staff assignment. The HTTPS receiver checked the signed envelope, returned a transient failure, and acknowledged a retry under the same event ID. [Integration log](evidence/release/integration.log) |
| OR-Tools | passed | `python -m unittest services.solver.test_solve services.solver.test_allocate`. Six tests covered timetable feasibility and inconclusive runs, allocation priority, reserves, exact credit fractions and deterministic ties. [Solver log](evidence/release/solver.log) |
| Application production build | passed | `npm run build` compiled the TypeScript services and built the Next.js production app. [Build log](evidence/release/build.log) |
| Browser workflow | passed | `bash infra/local/browser.sh` with Playwright's matching Chromium headless shell. The built portal passed Persian search, registration, the allocation navigation, mobile RTL, logout, staff sign-in and CSV download. [Browser log](evidence/release/browser.log) |
| Production Compose definitions | passed | `docker compose ... config --quiet` accepted the base and notification configurations with fixture values. [Compose log](evidence/release/compose.log) |
| Database runtime grants | passed | `psql` installed the production grants under two test roles and verified required access and sensitive exclusions in a rolled-back transaction. [Grant check](evidence/release/privileges.log) |
| Backup and restore | passed | `bash infra/local/restore-check.sh` restored a database populated by the release suite. The selected counts matched, and all three capacity invariants returned zero violations. [Restore log](evidence/release/restore.log) |
| Worker restart | passed | `node --import tsx infra/local/recovery.ts` terminated an isolated worker, committed an outbox event while it was stopped and verified that its replacement wrote one receipt and one intent. [Recovery log](evidence/release/recovery.log) |
| Production npm dependency audit | passed | `npm audit --omit=dev --json` reported zero advisories. [Audit result](evidence/release/npm-audit.json) |
| OCI image and packaged runtime | passed | `docker build -f infra/deployment/Dockerfile -t teaching-system:production-candidate .` built a local Linux ARM64 image. In the image, Node 24 ran as UID 1000, both solver suites passed, and the packaged Next.js root rendered Persian RTL with a read-only filesystem and no external network. [Build log](evidence/release/container-build.log) · [Image ID](evidence/release/image-id.log) · [Runtime smoke test](evidence/release/container-web.log) |
| Institutional acceptance | not_run | Actual SSO and provider endpoints, production-host TLS and ingress, production load, point-in-time recovery, accessibility and privacy sign-off need an authorized target and approved policies. |
| Full integration and failover exercises | not_run | Broker loss, in-flight solver termination, provider reconciliation and a complete role matrix were outside the executed restart and synthetic HTTPS checks. |

An earlier integration attempt timed out while the local container build ran. Its HTTPS fixture also compared undecoded OAuth Basic credentials. After correcting the fixture, the isolated integration rerun passed. A Chrome run then exposed a mobile menu state that persisted across sign-ins. After the menu reset fix, the matching Chromium headless shell passed. The final image build completed after limiting the build-time Node heap and reusing cached dependency layers.

The [requirements matrix](REQUIREMENTS_COVERAGE.csv) links each requirement to implementation and verification. The [release runbook](../infra/deployment/README.md) covers institutional setup and activation.
