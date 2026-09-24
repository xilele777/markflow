#!/usr/bin/env bash
# 临时目录 + 假 npm/node/pm2；验证切换与回滚，不启动真实应用，不访问服务器。
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d)
trap 'rm -rf -- "$FIXTURE"' EXIT
export PATH="$FIXTURE/bin:$PATH"
mkdir -p "$FIXTURE/state" "$FIXTURE/bin"
cat > "$FIXTURE/bin/npm" <<'SH'
#!/usr/bin/env bash
state=$(cd -- "$(dirname -- "$0")/../state" && pwd)
[[ ! -f "$state/fail-install" ]]
SH
cat > "$FIXTURE/bin/node" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat > "$FIXTURE/bin/pm2" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -z "${MARKFLOW_CONFIG_ENC_KEY:-}" && -z "${MARKFLOW_SMOKE_PASSWORD:-}" ]] || exit 99
state=$(cd -- "$(dirname -- "$0")/../state" && pwd)
printf '%s\n' "$*" >> "$state/pm2.log"
if [[ "$1" == start && -f "$state/fail-start" && "$2" == */bad/* ]]; then exit 1; fi
SH
chmod +x "$FIXTURE/bin/"*
make_root() {
  local root="$1"
  mkdir -p "$root/shared" "$root/releases"
  touch "$root/shared/server.env" "$root/shared/smoke.env"
  for rel in old good bad; do
    mkdir -p "$root/releases/$rel/server/dist" "$root/releases/$rel/web" "$root/releases/$rel/scripts"
    touch "$root/releases/$rel/server/dist/main.js" "$root/releases/$rel/server/package-lock.json" "$root/releases/$rel/web/index.html" "$root/releases/$rel/ecosystem.config.cjs" "$root/releases/$rel/release.json" "$root/releases/$rel/scripts/smoke.mjs"
    cat > "$root/releases/$rel/scripts/smoke.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ -r "$MARKFLOW_SMOKE_ENV_FILE" ]]
current=$(basename "$(readlink -f "$MARKFLOW_DEPLOY_ROOT/current")")
[[ "$current" != bad && ! -f "$MARKFLOW_TEST_STATE/fail-all-smoke" ]]
SH
  done
}
run() {
  MARKFLOW_CONFIG_ENC_KEY=must-not-enter-pm2 MARKFLOW_SMOKE_PASSWORD=must-not-enter-pm2 \
  MARKFLOW_TEST_STATE="$FIXTURE/state" MARKFLOW_DEPLOY_ROOT="$1" MARKFLOW_PUBLIC_BASE_URL=https://candidate.invalid \
    bash "$HERE/activate.sh" "$2"
}
ROOT="$FIXTURE/app"
make_root "$ROOT"
ln -s "$ROOT/releases/old" "$ROOT/current"
run "$ROOT" good
[[ "$(readlink -f "$ROOT/current")" == "$ROOT/releases/good" ]]
echo 'PASS atomic activation + isolated PM2 environment'
if run "$ROOT" bad; then echo 'Expected smoke failure' >&2; exit 1; fi
[[ "$(readlink -f "$ROOT/current")" == "$ROOT/releases/good" ]]
echo 'PASS smoke failure rolls back and exits nonzero'
touch "$FIXTURE/state/fail-start"
if run "$ROOT" bad; then echo 'Expected start failure' >&2; exit 1; fi
[[ "$(readlink -f "$ROOT/current")" == "$ROOT/releases/good" ]]
rm "$FIXTURE/state/fail-start"
echo 'PASS PM2 start failure rolls back'
touch "$FIXTURE/state/fail-install"
if run "$ROOT" old; then echo 'Expected install failure' >&2; exit 1; fi
[[ "$(readlink -f "$ROOT/current")" == "$ROOT/releases/good" ]]
rm "$FIXTURE/state/fail-install"
echo 'PASS install failure leaves current unchanged'
if run "$ROOT" ../escape; then echo 'Expected invalid path failure' >&2; exit 1; fi
mkdir -p "$FIXTURE/outside"
ln -s "$FIXTURE/outside" "$ROOT/releases/escape"
if run "$ROOT" escape; then echo 'Expected symlink failure' >&2; exit 1; fi
echo 'PASS path traversal and external symlink rejected'
FIRST="$FIXTURE/first"
make_root "$FIRST"
if run "$FIRST" bad; then echo 'Expected first activation failure' >&2; exit 1; fi
[[ ! -e "$FIRST/current" && ! -L "$FIRST/current" ]]
echo 'PASS first release failure removes current'
touch "$FIXTURE/state/fail-all-smoke"
if run "$ROOT" old; then echo 'Expected rollback health failure' >&2; exit 1; fi
[[ "$(readlink -f "$ROOT/current")" == "$ROOT/releases/good" ]]
rm "$FIXTURE/state/fail-all-smoke"
echo 'PASS rollback health failure remains nonzero'
(
  exec 8>"$ROOT/shared/deploy.lock"
  flock -n 8
  if run "$ROOT" old; then echo 'Expected concurrent activation failure' >&2; exit 1; fi
)
echo 'PASS concurrent activation rejected'
