#!/usr/bin/env bash
set -a
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env"
# shellcheck disable=SC1091
[[ -f "$(dirname "${BASH_SOURCE[0]}")/../generated/runtime.env" ]] && source "$(dirname "${BASH_SOURCE[0]}")/../generated/runtime.env"
set +a

WEB_PORT="${MOTAKE_WEB_PORT:-3000}"

cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/web"
exec pnpm exec next start --port "${WEB_PORT}"
