#!/usr/bin/env bash
set -euo pipefail
file=.env
if [[ -e "$file" ]]; then
  printf 'Using existing .env\n'
  exit 0
fi
umask 077
db_password=$(openssl rand -hex 24)
{
  printf 'LOCAL_DB_PASSWORD=%s\n' "$db_password"
  printf 'DATABASE_URL=postgresql://academic:%s@127.0.0.1:55432/academic_local\n' "$db_password"
  printf 'DEV_BOOTSTRAP_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  printf 'CURSOR_SECRET=%s\n' "$(openssl rand -hex 32)"
  sed -n '/^APP_ENV=/p; /^ENABLE_DEVELOPMENT_AUTH=/p; /^ALLOW_SYNTHETIC_SEED=/p; /^WEB_ORIGIN=/p; /^INTERNAL_API_URL=/p; /^API_HOST=/p; /^API_PORT=/p; /^COOKIE_SECURE=/p; /^REQUEST_RETENTION_HOURS=/p; /^QUEUE_REDIS_URL=/p; /^SOLVER_PYTHON=/p; /^SOLVER_LIMIT_SECONDS=/p' .env.example
} > "$file"
printf 'Created .env with unique generated development credentials.\n'
