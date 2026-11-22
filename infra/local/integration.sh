#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Use a fresh isolated academic_test database}"
: "${QUEUE_REDIS_URL:?Set dedicated test Redis or use a unique queue namespace}"
export APP_ENV=development ENABLE_DEVELOPMENT_AUTH=true ALLOW_SYNTHETIC_SEED=true
export DEV_BOOTSTRAP_PASSWORD="${DEV_BOOTSTRAP_PASSWORD:-$(openssl rand -hex 24)}"
export CURSOR_SECRET="${CURSOR_SECRET:-$(openssl rand -hex 32)}"
export REQUEST_RETENTION_HOURS=72 SOLVER_LIMIT_SECONDS=5 REPORT_MIN_CELL=2
export WEB_ORIGIN=http://localhost:3000 API_PORT="${TEST_API_PORT:-4101}"
export TEST_API_URL="http://127.0.0.1:$API_PORT"
export QUEUE_NAME="academic-test-$(openssl rand -hex 8)"
npm run db:migrate
npm run db:generate
npm run db:seed
logs=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=academic-release-fixture' \
  -addext 'subjectAltName=IP:127.0.0.1' -keyout "$logs/test-https.key" -out "$logs/test-https.crt" >/dev/null 2>&1
node --import tsx apps/api/src/main.ts > "$logs/api.log" 2>&1 & api_pid=$!
node --import tsx apps/workers/src/main.ts > "$logs/worker.log" 2>&1 & worker_pid=$!
trap 'kill "$api_pid" "$worker_pid" 2>/dev/null || :; rm -f "$logs/test-https.key"; printf "Integration logs: %s\n" "$logs"' EXIT
for attempt in {1..40}; do
  if curl -fsS "$TEST_API_URL/health/ready" > /dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -fsS "$TEST_API_URL/health/ready"
NODE_EXTRA_CA_CERTS="$logs/test-https.crt" TEST_HTTPS_KEY="$logs/test-https.key" npm run test:integration
