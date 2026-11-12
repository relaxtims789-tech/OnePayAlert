#!/usr/bin/env bash
# Restore a backup made by backup.sh.
#
#   deploy/restore.sh onepay-prod deploy/env/production.env backups/onepay-onepay-prod-<stamp>.dump
#       Restore drill (default): restores into a NEW database "onepay_restore_<stamp>", prints row
#       counts and leaves the live database untouched. Run it monthly; drop the copy afterwards.
#
#   deploy/restore.sh onepay-prod deploy/env/production.env <dump> --replace-live
#       Disaster recovery: stops the API and dashboards, replaces the live database with the dump,
#       re-applies migrations and the app role, and starts everything again.
set -euo pipefail

PROJECT="${1:?usage: restore.sh <compose project> <env file> <dump> [--replace-live]}"
ENV_FILE="${2:?env file}"
DUMP="${3:?dump file}"
MODE="${4:-drill}"
HERE="$(cd "$(dirname "$0")" && pwd)"
compose() { docker compose -p "$PROJECT" -f "$HERE/compose.yaml" --env-file "$ENV_FILE" "$@"; }
psql_owner() { compose exec -T postgres psql -v ON_ERROR_STOP=1 -U onepay_owner -d "$1"; }

[ -f "$DUMP" ] || { echo "no such dump: $DUMP" >&2; exit 1; }
if [ -f "$DUMP.sha256" ]; then
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
fi

if [ "$MODE" != "--replace-live" ]; then
  TARGET="onepay_restore_$(date -u +%Y%m%d%H%M%S)"
  echo "Restore drill into $TARGET (live database untouched)"
  echo "CREATE DATABASE $TARGET;" | psql_owner postgres
  compose exec -T postgres pg_restore -U onepay_owner -d "$TARGET" --no-owner --exit-on-error < "$DUMP"
  echo "SELECT 'companies' AS t, count(*) FROM companies UNION ALL SELECT 'transactions', count(*) FROM transactions UNION ALL SELECT 'invoices', count(*) FROM invoices;" | psql_owner "$TARGET"
  echo "Done. Drop it when checked:  echo 'DROP DATABASE $TARGET;' | docker compose -p $PROJECT ... exec -T postgres psql -U onepay_owner -d postgres"
  exit 0
fi

read -r -p "This REPLACES the live database of $PROJECT with $DUMP. Type the project name to continue: " CONFIRM
[ "$CONFIRM" = "$PROJECT" ] || { echo "aborted"; exit 1; }
compose stop caddy merchant-web admin-web api
echo "DROP DATABASE IF EXISTS onepay WITH (FORCE); CREATE DATABASE onepay;" | psql_owner postgres
compose exec -T postgres pg_restore -U onepay_owner -d onepay --no-owner --exit-on-error < "$DUMP"
compose run --rm migrate
compose up -d
echo "Live database restored from $DUMP"
