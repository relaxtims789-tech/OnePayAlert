#!/usr/bin/env bash
# Creates or resets the Super Admin from the environment's env file:
#   deploy/reset-admin.sh onepay-prod deploy/env/production.env
#
# Reads SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD (at least 12 characters) from the env file, which
# the operator edits by hand: the password is never typed on a command line, printed or logged.
# The account gets the SUPER_ADMIN platform role and is made active, its other sessions end, and
# any sign-in lockout on it is cleared. Running it again with a new password changes the password.
set -euo pipefail

PROJECT="${1:?usage: reset-admin.sh <compose project> [env file]}"
ENV_FILE="${2:-deploy/env/production.env}"
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -r "$ENV_FILE" ] || { echo "Cannot read $ENV_FILE. Nothing changed." >&2; exit 1; }

compose() { docker compose -p "$PROJECT" -f "$HERE/compose.yaml" --env-file "$ENV_FILE" "$@"; }
# The first NAME=value line, taken literally (no shell expansion), without surrounding quotes.
val() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true; }

EMAIL="$(val SUPERADMIN_EMAIL | tr '[:upper:]' '[:lower:]')"
STAFF_PASSWORD="$(val SUPERADMIN_PASSWORD)"
[ -n "$EMAIL" ] || { echo "SUPERADMIN_EMAIL is empty in $ENV_FILE. Nothing changed." >&2; exit 1; }
[ ${#STAFF_PASSWORD} -ge 12 ] || { echo "SUPERADMIN_PASSWORD in $ENV_FILE must be at least 12 characters. Nothing changed." >&2; exit 1; }
export STAFF_PASSWORD

compose run --rm -e STAFF_PASSWORD migrate \
  sh -c "DATABASE_URL=\$MIGRATION_DATABASE_URL npx ts-node prisma/create-staff.ts \"$EMAIL\" \"Super Admin\" SUPER_ADMIN"
unset STAFF_PASSWORD

# Same key as the API's LoginLockoutService: onepay:<APP_ENV>:login:<fails|lock>:<sha256(email)[0..40]>.
ID="$(printf '%s' "$EMAIL" | sha256sum | cut -c1-40)"
APP_ENV="$(val APP_ENV)"
REDISCLI_AUTH="$(val REDIS_PASSWORD)" compose exec -T -e REDISCLI_AUTH redis \
  redis-cli DEL "onepay:$APP_ENV:login:fails:$ID" "onepay:$APP_ENV:login:lock:$ID" >/dev/null

echo "Done. Sign in as $EMAIL at https://$(val ADMIN_DOMAIN)"
