#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f local/.env && ! -f .env.local ]]; then node scripts/init-local.mjs; fi
if [[ "$(docker info --format '{{.Driver}}')" == vfs ]]; then
 if ! docker image inspect estatematch-storage-flat:1.82.1 >/dev/null 2>&1; then python3 scripts/flatten-storage.py; fi
 export ESTATEMATCH_STORAGE_IMAGE=estatematch-storage-flat:1.82.1
fi
docker compose --env-file local/.env -f local/compose.yml up -d
for endpoint in auth/v1/health storage/v1/status; do
 ready=false
 for attempt in $(seq 1 60); do
   if curl -fsS "http://127.0.0.1:54321/$endpoint" >/dev/null 2>&1; then ready=true; break; fi
   sleep 1
 done
 if [[ "$ready" != true ]]; then echo "$endpoint did not become ready" >&2; exit 1; fi
done
docker exec -i estatematch-db psql -U postgres -v ON_ERROR_STOP=1 < local/storage-grants.sql >/dev/null
# Initial application migration is explicitly tracked, not rerun on every start.
for migration in supabase/migrations/*.sql; do
 name=$(basename "$migration")
 docker exec estatematch-db psql -U postgres -v ON_ERROR_STOP=1 -c 'create schema if not exists local_setup; create table if not exists local_setup.migrations(name text primary key)' >/dev/null
 applied=$(docker exec estatematch-db psql -U postgres -Atc "select count(*) from local_setup.migrations where name='$name'")
 if [[ "$applied" == 0 ]]; then
   printf 'Applying DB update: %s\n' "$name"
   docker exec -i estatematch-db psql -U postgres -v ON_ERROR_STOP=1 < "$migration" >/dev/null
   docker exec estatematch-db psql -U postgres -v ON_ERROR_STOP=1 -c "insert into local_setup.migrations values('$name')" >/dev/null
 fi
done
# Seed bootstraps empty offices only; normal restarts never recreate test data.
docker exec -i estatematch-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/seed.sql >/dev/null
docker compose --env-file local/.env -f local/compose.yml kill -s SIGUSR1 rest >/dev/null
printf 'Local Auth, REST, Storage, migrations and synthetic accounts prepared.\n'
