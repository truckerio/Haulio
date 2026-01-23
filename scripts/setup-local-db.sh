#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-haulio_dev}"
ROLE="${2:-}"

if [[ -z "$ROLE" ]]; then
  ROLE="$(psql -t -d postgres -c "SELECT current_user;" | tr -d '[:space:]')"
fi

if [[ -z "$ROLE" ]]; then
  echo "Could not determine local Postgres role."
  echo "Provide it explicitly: scripts/setup-local-db.sh ${DB_NAME} <role>"
  exit 1
fi

EXISTS="$(psql -t -d postgres -c "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"
if [[ "$EXISTS" == "1" ]]; then
  echo "Database '${DB_NAME}' already exists. Skipping creation."
  exit 0
fi

psql -d postgres -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${ROLE}\";"
echo "Created database '${DB_NAME}' owned by '${ROLE}'."
