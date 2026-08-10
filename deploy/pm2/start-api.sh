#!/usr/bin/env bash
set -a
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env"
# shellcheck disable=SC1091
[[ -f "$(dirname "${BASH_SOURCE[0]}")/../generated/runtime.env" ]] && source "$(dirname "${BASH_SOURCE[0]}")/../generated/runtime.env"
set +a

cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/api"
exec node dist/index.js
