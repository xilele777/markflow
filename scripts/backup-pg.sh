#!/usr/bin/env bash
set -euo pipefail
umask 077
# 密码由 ~/.pgpass（0600）提供，连接参数使用 libpq 标准环境变量。
: "${PGDATABASE:?Set PGDATABASE}" "${PGUSER:?Set PGUSER}"
DEST=$(realpath -e -- "${LINGSHU_BACKUP_DIR:-/srv/lingshu/backups}")
exec 9>"$DEST/.backup.lock"
flock -n 9 || { echo 'Backup already running' >&2; exit 1; }
FILE="$DEST/lingshu-$(date -u +%Y%m%dT%H%M%SZ).dump"
[[ ! -e "$FILE" ]]
trap 'rm -f -- "$FILE.partial" "$FILE.sha256.partial"' EXIT
pg_dump --no-password --format=custom --file="$FILE.partial"
pg_restore --list "$FILE.partial" >/dev/null
mv -- "$FILE.partial" "$FILE"
(cd "$DEST" && sha256sum "$(basename "$FILE")") > "$FILE.sha256.partial"
mv -- "$FILE.sha256.partial" "$FILE.sha256"
echo "Backup ready: $FILE (upload off-host and restore-test before retention cleanup)"
# 不自动删除；异地备份确认前保留所有副本。保留策略见 DEPLOY.md。
