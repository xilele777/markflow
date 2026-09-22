#!/usr/bin/env bash
# Linux/GNU coreutils。只激活已组装 release；不改 Nginx、不迁移 LabelHub 数据。
set -Eeuo pipefail
umask 077
ROOT=$(realpath -e -- "${LINGSHU_DEPLOY_ROOT:-/srv/lingshu}")
REL="${1:?Usage: activate.sh <release-name>}"
[[ "$REL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$ ]] || { echo 'Invalid release name' >&2; exit 2; }
DIR=$(realpath -e -- "$ROOT/releases/$REL")
[[ "$DIR" == "$ROOT/releases/$REL" && ! -L "$ROOT/releases/$REL" ]] || { echo 'Release must be a real directory directly under releases' >&2; exit 2; }
for command in node npm pm2 flock; do command -v "$command" >/dev/null; done
[[ -d "$ROOT/shared" && -r "$ROOT/shared/server.env" && -r "$ROOT/shared/smoke.env" ]]
if [[ -z "${LINGSHU_PUBLIC_BASE_URL:-}" && -r "$ROOT/shared/public-url" ]]; then
  LINGSHU_PUBLIC_BASE_URL=$(cat -- "$ROOT/shared/public-url")
fi
[[ -f "$DIR/server/dist/main.js" && -f "$DIR/server/package-lock.json" && -f "$DIR/web/index.html" && -f "$DIR/ecosystem.config.cjs" && -f "$DIR/release.json" && -f "$DIR/scripts/smoke.mjs" ]]
[[ ! -e "$ROOT/current" || -L "$ROOT/current" ]] || { echo 'current must be a symlink' >&2; exit 2; }
exec 9>"$ROOT/shared/deploy.lock"
flock -n 9 || { echo 'Another activation is running' >&2; exit 2; }
PREV=''
if [[ -L "$ROOT/current" ]]; then
  PREV=$(realpath -e -- "$ROOT/current")
  [[ "$(dirname -- "$PREV")" == "$ROOT/releases" ]] || { echo 'current is outside releases' >&2; exit 2; }
fi
[[ "$PREV" != "$DIR" ]] || { echo 'Already current; no changes'; exit 0; }
# 不 source server.env，避免密钥进入 shell/PM2 dump；发布必须使用本项目专用账户/PM2 daemon。
pm() { env -i HOME="$HOME" PATH="$PATH" USER="${USER:-lingshu}" LANG=C.UTF-8 PM2_HOME="${PM2_HOME:-$HOME/.pm2}" pm2 "$@"; }
atomic_link() {
  ln -s -- "$1" "$ROOT/.current-$$"
  mv -Tf -- "$ROOT/.current-$$" "$ROOT/current"
}
start_release() {
  pm delete lingshu >/dev/null 2>&1 || true
  pm start "$1/ecosystem.config.cjs" --only lingshu
}
check_release() {
  local expected
  expected=$(basename "$(readlink -f -- "$ROOT/current")")
  LINGSHU_EXPECTED_RELEASE="$expected" LINGSHU_SMOKE_ENV_FILE="$ROOT/shared/smoke.env" bash "$DIR/scripts/smoke.sh" "${LINGSHU_SMOKE_BASE_URL:-http://127.0.0.1:8080}" --api-only &&
  LINGSHU_EXPECTED_RELEASE="$expected" LINGSHU_SMOKE_ENV_FILE="$ROOT/shared/smoke.env" bash "$DIR/scripts/smoke.sh" "${LINGSHU_PUBLIC_BASE_URL:?Set LINGSHU_PUBLIC_BASE_URL to the candidate Nginx HTTPS URL}"
}
SWITCHED=0
rollback() {
  local code=$?
  trap - ERR INT TERM
  if [[ "$SWITCHED" == 1 ]]; then
    echo "Activation failed; rolling back to ${PREV:-<none>}" >&2
    if [[ -n "$PREV" ]]; then
      if atomic_link "$PREV" && start_release "$PREV" && check_release; then
        pm save --force || true
        echo 'Rollback passed; deployment remains failed' >&2
      else
        echo 'CRITICAL: rollback did not pass; manual recovery required' >&2
      fi
    else
      pm delete lingshu >/dev/null 2>&1 || true
      rm -f -- "$ROOT/current"
      pm save --force || true
      echo 'First activation failed; stopped application (database migrations are not reverted)' >&2
    fi
  fi
  rm -f -- "$ROOT/.current-$$"
  exit "${code:-1}"
}
trap rollback ERR
trap 'false' INT TERM
: "${LINGSHU_PUBLIC_BASE_URL:?Set candidate Nginx URL before activation}"
# 安装失败发生在切换前；每个 release 独立安装，不共享可变 node_modules。
(cd "$DIR/server" && npm ci --omit=dev --no-audit --no-fund)
node --env-file="$ROOT/shared/server.env" --input-type=module -e 'const { loadConfig } = await import(process.argv[1]); loadConfig()' "file://$DIR/server/dist/infra/config.js"
SWITCHED=1
atomic_link "$DIR"
start_release "$DIR"
check_release
pm save --force
SWITCHED=0
trap - ERR INT TERM
echo "Activated $REL (previous: ${PREV:-none}); releases retained for manual review"
