#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Use a fresh isolated academic_test database}"
export APP_ENV=development ENABLE_DEVELOPMENT_AUTH=true ALLOW_SYNTHETIC_SEED=true
export DEV_BOOTSTRAP_PASSWORD="${DEV_BOOTSTRAP_PASSWORD:-$(openssl rand -hex 24)}"
export CURSOR_SECRET="${CURSOR_SECRET:-$(openssl rand -hex 32)}"
export REQUEST_RETENTION_HOURS=72 REPORT_MIN_CELL=2
export API_PORT="${BROWSER_API_PORT:-4102}"
web_port="${BROWSER_WEB_PORT:-3002}"
export INTERNAL_API_URL="http://127.0.0.1:$API_PORT"
export WEB_ORIGIN="http://localhost:$web_port"
export TEST_WEB_URL="$WEB_ORIGIN"
npm run db:migrate
npm run db:seed
logs=$(mktemp -d)
node --import tsx apps/api/src/main.ts > "$logs/api.log" 2>&1 & api_pid=$!
(cd apps/web && exec ../../node_modules/.bin/next start --hostname 127.0.0.1 --port "$web_port") > "$logs/web.log" 2>&1 & web_pid=$!
trap 'kill "$api_pid" "$web_pid" 2>/dev/null || :; printf "Browser test logs: %s\n" "$logs"' EXIT
for attempt in {1..40}; do
  if curl -fsS "$TEST_WEB_URL/api/session/config" > /dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -fsS "$TEST_WEB_URL/api/session/config"
npm run test:e2e
