#!/usr/bin/env bash
# Nightly database backup for one environment (run from cron on the host):
#   deploy/backup.sh onepay-prod deploy/env/production.env
#   15 2 * * * cd /srv/onepay && deploy/backup.sh onepay-prod deploy/env/production.env >> /var/log/onepay-backup.log 2>&1
#
# Writes a compressed custom-format dump, checks it can be read back, records a SHA-256, and
# deletes dumps older than KEEP_DAYS (default 14). Copy the backup folder off the host (rclone,
# object storage with versioning): a backup on the same disk does not survive losing the disk.
set -euo pipefail

PROJECT="${1:?usage: backup.sh <compose project> [env file]}"
ENV_FILE="${2:-deploy/env/production.env}"
KEEP_DAYS="${KEEP_DAYS:-14}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HERE/backups}"
mkdir -p "$BACKUP_DIR"

compose() { docker compose -p "$PROJECT" -f "$HERE/compose.yaml" --env-file "$ENV_FILE" "$@"; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/onepay-$PROJECT-$STAMP.dump"

echo "[$(date -u +%FT%TZ)] backing up $PROJECT → $FILE"
compose exec -T postgres pg_dump -U onepay_owner -d onepay --format=custom --compress=9 > "$FILE.partial"
# A dump that pg_restore cannot list is useless: fail loudly instead of keeping it.
compose exec -T postgres pg_restore --list < "$FILE.partial" > /dev/null
mv "$FILE.partial" "$FILE"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
echo "[$(date -u +%FT%TZ)] ok: $(du -h "$FILE" | cut -f1)"

find "$BACKUP_DIR" -name "onepay-$PROJECT-*.dump*" -mtime +"$KEEP_DAYS" -print -delete
