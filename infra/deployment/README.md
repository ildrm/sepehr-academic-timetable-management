# Production deployment

Use this runbook on an approved host after the registrar, identity administrator, privacy officer, and operations owner have signed off. The application ships as one immutable image with separate API, web, migration and worker commands. The API and worker use independently provisioned PostgreSQL roles. The worker also uses an authenticated Redis service. Redis carries jobs. PostgreSQL remains authoritative for requests, seats, reviews, and job leases.

## Configure the environment

1. Build with `docker build -f infra/deployment/Dockerfile -t academic-release .` for the host architecture. The local release candidate was verified on Linux ARM64. Publish the reviewed image to the institution's registry from its release pipeline and record the digest. Set `APP_IMAGE` to that digest. [Local image evidence](../../implementation/evidence/release/image-id.log)
2. Copy [config.example.env](config.example.env) to an operator-managed file outside the repository. Fill in the HTTPS public origin, registered OIDC issuer and client, required staff ACR, approved receipt retention, solver budget, and CSV suppression threshold. Register the exact callback `https://<public-origin>/api/session/oidc/callback`. Provision identity bindings by exact signed issuer and subject and assign time-bounded scopes through an approved account provisioning process.
3. Provision an isolated PostgreSQL database with tested backups and point-in-time recovery. Give the migration role ownership of the application's schema and two separate login roles for the API and worker. Grant the latter only the privileges in [privileges.sql](privileges.sql) after every migration. Require password-authenticated DSNs with `sslmode=verify-full` and hostname verification. Use a private CA through a mounted trust file if the approved server uses one. [PostgreSQL client TLS options](https://node-postgres.com/features/ssl)
4. Provision authenticated `rediss://` with certificate verification, approved RAM and persistence, and a `noeviction` policy. Persistent job metadata is rebuilt from PostgreSQL after queue disruption. Set the same queue name on the worker and API. [BullMQ connection requirements](https://docs.bullmq.io/guide/connections)
5. Supply secret files for the three database DSNs, Redis DSN, OIDC client secret and cursor signing key. Each file contains one value and must be readable by the service's container UID 1000, with private host ownership and permissions. The compose file mounts each secret only into its consuming service. For a private CA, mount the CA into the corresponding containers and configure `NODE_EXTRA_CA_CERTS`, `QUEUE_REDIS_CA_FILE`, or a Postgres DSN trust file as appropriate, then test the exact trust chain. [Docker Compose secret files](https://docs.docker.com/compose/how-tos/use-secrets/)
6. Configure the approved HTTPS ingress to proxy the public origin to the web service's loopback port. Keep port 4100, health and metrics endpoints, Redis, and PostgreSQL off the public interface. Apply the approved ingress body, timeout, rate, and connection limits. Point trusted internal monitoring at the API service on its network.

## Apply, check and activate

Run from the repository root with `ACADEMIC_COMPOSE_ENV` set to the path of the operator-managed environment file. Take a verified backup before applying migrations.

```sh
docker compose --env-file "$ACADEMIC_COMPOSE_ENV" -f infra/deployment/compose.yaml config --quiet
docker compose --env-file "$ACADEMIC_COMPOSE_ENV" -f infra/deployment/compose.yaml --profile operator run --rm migrator
psql -X -v api_role="$ACADEMIC_API_ROLE" -v worker_role="$ACADEMIC_WORKER_ROLE" -f infra/deployment/privileges.sql
docker compose --env-file "$ACADEMIC_COMPOSE_ENV" -f infra/deployment/compose.yaml run --rm --no-deps api node dist/apps/api/src/release.js preflight
docker compose --env-file "$ACADEMIC_COMPOSE_ENV" -f infra/deployment/compose.yaml up -d --wait api web worker
```

Use a PostgreSQL service definition or password file for the migration-owner connection used by `psql`. Preflight checks database access, approved institutional policy, active role scopes bound to the configured issuer, and term queue guards. Before opening traffic, verify browser SSO through the actual ingress, privileged role assurance, scoped operations, health, outbox progress, and a witnessed recovery drill. Keep registration windows closed until academic acceptance.

## Notifications

Enable [notification.override.yaml](notification.override.yaml) only after approving the HTTPS gateway, contents and retry contract. Set `NOTIFICATION_GATEWAY_URL` and a file path in `NOTIFICATION_SIGNING_KEY_FILE`. Supply both Compose files for configuration and startup. The receiver must verify the HMAC-SHA256 in `X-Event-Signature` over the exact `X-Event-Timestamp + "." + raw body`, enforce freshness and a durable idempotency key, and return a JSON receipt under 4096 bytes with the matching `eventId` and a nonempty `receipt` of at most 120 characters. The ID is supplied in the `Idempotency-Key` request header. An already delivered key must return its original success receipt. The envelope contains only event ID, type, occurrence time, term reference, resource reference and revision.

Transient HTTP errors and uncertain responses are retried with that same event ID. Permanent rejection, an invalid receipt, or a depleted lease or retry budget leads to review. Review blocks later events for that aggregate until resolved. Historical unconfigured intents need a documented decision on whether delivery is still appropriate. During recovery, reconcile with the gateway using the original event IDs before touching pending intent state.

## Monitor and recover

- The private API endpoint `/internal/metrics` exposes HTTP latency and outcomes, transaction retries, worker heartbeat age, queue depth, oldest unconsumed outbox age and notification review count. [Initial alert rules](alerts.yaml)
- Attach alerts to the institution's approved on-call routes and set operation-specific latency, error, backlog and recovery thresholds using the accepted load profile. Treat process-local counters as resettable after deploys. Investigate missing scrapes and stale worker heartbeats before accepting commands during a larger incident.
- For a broker outage or worker restart, verify the PostgreSQL database and queue connectivity. Bring the worker back first among background services and observe receipts, leases, duplicate suppression and the oldest unconsumed outbox event. Retain request and event IDs during reconciliation.
- For rollback, close affected windows or disable ingress and pause delivery. Select the last compatible image digest after reviewing the migration. For an incompatible storage change, use the approved restore process against a fresh instance, run invariant and audit comparisons, and reconcile acknowledged commands and provider receipts before cutover. The [local restore script](../local/restore-check.sh) applies only to synthetic data.
- Keep deployment approval, restore timing, release digest, known deviations and post-deploy checks in the institution's release record. [Current acceptance gates](../../implementation/BLOCKERS.md)
