#!/usr/bin/env bash
set -euo pipefail
container="${LOCAL_PG_CONTAINER:-teaching-implementation-postgres-1}"
source_db="${1:-academic_local}"
[[ "$source_db" =~ ^academic_(local|test(_[a-z0-9]+)?)$ ]] || { printf 'Only an isolated local fixture database is accepted\n' >&2; exit 2; }
dest="academic_test_restore$(openssl rand -hex 4)"
tmp="$(mktemp -d)"
docker exec "$container" createdb -U academic "$dest"
docker exec "$container" pg_dump -Fc -U academic "$source_db" > "$tmp/backup.dump"
docker exec -i "$container" pg_restore -U academic --exit-on-error --no-owner -d "$dest" < "$tmp/backup.dump"
docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U academic -d "$source_db" < infra/local/reconcile.sql > "$tmp/source"
docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U academic -d "$dest" < infra/local/reconcile.sql > "$tmp/restored"
diff -u "$tmp/source" "$tmp/restored"
[[ "$(head -n 3 "$tmp/restored")" == $'0\n0\n0' ]]
printf 'Restored into a fresh isolated database. Selected counts and invariants matched.\n'
cat "$tmp/restored"
printf 'Archive and comparison files are in %s.\n' "$tmp"
