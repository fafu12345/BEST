#!/bin/sh
set -eu
# Credentials come from Compose environment; never print a URL/password.
while :; do
  if ! psql -X -v ON_ERROR_STOP=1 -Atc "select private.run_property_contract_schedules();"; then
    echo 'Property schedule unavailable; retrying in 60 seconds.' >&2
  fi
  sleep 60
done
