#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Tests run in a transaction and roll back. Use only the local development container.
docker exec -i "${ESTATEMATCH_DB_CONTAINER:-estatematch-db}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/permissions.sql
