#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--force]

Creates .env files for the monorepo based on each package's env schema.

  --force   Overwrite existing .env files

Files created:
  .env
  apps/api/.env
  apps/web/.env.local
  packages/database/.env
  packages/services/.env
  packages/logger/.env
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Defaults aligned with docker-compose.yml and env.ts / env.js schemas
PORT="${PORT:-8000}"
NODE_ENV="${NODE_ENV:-development}"
BASE_URL="${BASE_URL:-http://localhost:8000}"
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/dev}"
LOGGER_LEVEL="${LOGGER_LEVEL:-debug}"
JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-change-in-production}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000/trpc}"

write_env_file() {
  local target="$1"
  local content="$2"

  if [[ -f "$target" && "$FORCE" != true ]]; then
    echo "skip  $target (already exists; use --force to overwrite)"
    return 0
  fi

  mkdir -p "$(dirname "$target")"
  printf '%s\n' "$content" >"$target"
  echo "write $target"
}

write_env_file "$ROOT_DIR/.env" "$(cat <<EOF
# apps/api (apps/api/src/env.ts)
PORT=$PORT
NODE_ENV=$NODE_ENV
BASE_URL=$BASE_URL

# packages/database (packages/database/env.ts)
DATABASE_URL=$DATABASE_URL

# packages/logger (packages/logger/env.ts)
LOGGER_LEVEL=$LOGGER_LEVEL

# packages/services (packages/services/env.ts)
NODE_ENV=$NODE_ENV
JWT_SECRET=$JWT_SECRET

# apps/web (apps/web/env.js)
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
EOF
)"

write_env_file "$ROOT_DIR/apps/api/.env" "$(cat <<EOF
# apps/api/src/env.ts
PORT=$PORT
NODE_ENV=$NODE_ENV
BASE_URL=$BASE_URL
EOF
)"

write_env_file "$ROOT_DIR/apps/web/.env.local" "$(cat <<EOF
# apps/web/env.js
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
EOF
)"

write_env_file "$ROOT_DIR/packages/database/.env" "$(cat <<EOF
# packages/database/env.ts
DATABASE_URL=$DATABASE_URL
EOF
)"

write_env_file "$ROOT_DIR/packages/services/.env" "$(cat <<EOF
# packages/services/env.ts
NODE_ENV=$NODE_ENV
JWT_SECRET=$JWT_SECRET
EOF
)"

write_env_file "$ROOT_DIR/packages/logger/.env" "$(cat <<EOF
# packages/logger/env.ts
NODE_ENV=$NODE_ENV
LOGGER_LEVEL=$LOGGER_LEVEL
EOF
)"

echo
echo "Done. Start Postgres with: docker compose up -d"
echo "Then run: pnpm dev"
