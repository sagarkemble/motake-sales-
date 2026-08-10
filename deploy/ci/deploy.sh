#!/usr/bin/env bash
set -euo pipefail

# Non-interactive full-stack deploy for CI / GitHub Actions.
# Run on the VPS after code sync and env setup.

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

SKIP_BUILD=false
SKIP_CADDY=false
SKIP_MIGRATE=false
SKIP_HEALTH=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--skip-build] [--skip-caddy] [--skip-migrate] [--skip-health]

Non-interactive VPS deployment (PM2 + Caddy).

Required environment variables:
  MOTAKE_ROUTING_MODE          separate|single
  MOTAKE_FRONTEND_DOMAIN       e.g. motake-front.lunarstudio.dev
  MOTAKE_API_DOMAIN            e.g. motake-back.lunarstudio.dev
  MOTAKE_FRONTEND_PORT         default: 3001
  MOTAKE_API_PORT              default: 8001
  MOTAKE_INSTALL_TARGET        default: system

Prerequisites:
  - Root .env exists (run deploy/ci/write-env.sh first)
  - pnpm, pm2, caddy installed on VPS
  - For --skip-build: apps/api/dist and apps/web/.next must exist
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-caddy)
      SKIP_CADDY=true
      shift
      ;;
    --skip-migrate)
      SKIP_MIGRATE=true
      shift
      ;;
    --skip-health)
      SKIP_HEALTH=true
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

require_ci_env() {
  local missing=()

  for var in MOTAKE_ROUTING_MODE MOTAKE_FRONTEND_DOMAIN MOTAKE_API_DOMAIN; do
    if [[ -z "${!var:-}" ]]; then
      missing+=("$var")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "error: missing required environment variables: ${missing[*]}" >&2
    exit 1
  fi
}

main() {
  require_ci_env

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "error: ${ENV_FILE} not found — run deploy/ci/write-env.sh first" >&2
    exit 1
  fi

  require_command "pnpm" "Install Node.js 22+ and pnpm"
  require_command "pm2" "Install PM2 globally: npm install -g pm2"
  require_command "node" "Install Node.js 22+"

  ensure_deploy_dirs

  echo "Motake CI deployment"
  echo "  root: ${ROOT_DIR}"

  echo
  echo "Port assignment"
  echo "───────────────"
  assign_ports
  echo "  web port: ${DEPLOY_WEB_PORT}"
  echo "  api port: ${DEPLOY_API_PORT}"

  DEPLOY_ROUTING_MODE="${MOTAKE_ROUTING_MODE}"
  DEPLOY_FRONTEND_DOMAIN="${MOTAKE_FRONTEND_DOMAIN}"
  DEPLOY_API_DOMAIN="${MOTAKE_API_DOMAIN:-$MOTAKE_FRONTEND_DOMAIN}"

  validate_domain "$DEPLOY_FRONTEND_DOMAIN"
  validate_domain "$DEPLOY_API_DOMAIN"

  if [[ "$SKIP_BUILD" != true ]]; then
    echo
    echo "Installing dependencies..."
    (cd "$ROOT_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)

    if [[ "$SKIP_MIGRATE" != true ]]; then
      echo "Running database migrations..."
      (cd "$ROOT_DIR" && pnpm db:migrate) || echo "  warn: db:migrate failed — check DATABASE_URL"
    fi

    echo "Building production apps..."
    (cd "$ROOT_DIR" && pnpm build)
  else
    echo "skip  build (--skip-build)"
    if [[ "$SKIP_MIGRATE" != true ]]; then
      echo "Running database migrations..."
      (cd "$ROOT_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
      (cd "$ROOT_DIR" && pnpm db:migrate) || echo "  warn: db:migrate failed — check DATABASE_URL"
    fi
  fi

  verify_build_artifacts
  start_pm2_apps

  if [[ "$SKIP_CADDY" != true ]]; then
    echo
    echo "Caddy reverse proxy"
    echo "───────────────────"
    run_caddy_setup
  else
    echo "skip  caddy (--skip-caddy)"
  fi

  if [[ "$SKIP_HEALTH" != true ]]; then
    health_check_local || true
  fi

  echo
  echo "CI deployment complete."
  echo "  Frontend: https://${DEPLOY_FRONTEND_DOMAIN}"
  if [[ "$DEPLOY_ROUTING_MODE" == "separate" ]]; then
    echo "  API:      https://${DEPLOY_API_DOMAIN}/trpc"
  else
    echo "  API:      https://${DEPLOY_FRONTEND_DOMAIN}/trpc"
  fi
}

main "$@"
