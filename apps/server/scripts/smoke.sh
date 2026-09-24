#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# 账户凭据只在 Node 子进程从 env-file 读取，不导出给 PM2，也不作为命令行参数。
if [[ -n "${MARKFLOW_SMOKE_ENV_FILE:-}" ]]; then
  exec node --env-file="$MARKFLOW_SMOKE_ENV_FILE" "$HERE/smoke.mjs" "$@"
fi
exec node "$HERE/smoke.mjs" "$@"
