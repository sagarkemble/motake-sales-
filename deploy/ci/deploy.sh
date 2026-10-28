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

Non-interactive VPS deployment (PM2 + notification container + Caddy).

Required environment variables:
  MOTAKE_ROUTING_MODE          separate|single
  MOTAKE_FRONTEND_DOMAIN       e.g. motake-front.lunarstudio.dev
  MOTAKE_API_DOMAIN            e.g. motake-back.lunarstudio.dev
  MOTAKE_FRONTEND_PORT         default: 3000
  MOTAKE_API_PORT              default: 8000
  MOTAKE_NOTIFICATION_PORT     default: 8100 (published on 127.0.0.1 only)
  MOTAKE_INSTALL_TARGET        default: system

Prerequisites:
  - Root .env exists (run deploy/ci/write-env.sh first)
  - deploy/generated/notification.env for the notification container (write-env.sh writes it;
    without it the container is skipped)
  - pnpm, pm2, caddy, docker installed on VPS
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

run_db_migrate() {
  echo "Running database migrations..."
  if ! (
    cd "$ROOT_DIR"
    CI=true NODE_ENV=development pnpm install --frozen-lockfile --filter @repo/database...
    pnpm --filter @repo/database db:migrate
  ); then
    echo "error: db:migrate failed — deploy stopped before restarting the apps." >&2
    echo "  Check DATABASE_URL (use the Supabase pooler host) and the drizzle-kit install." >&2
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
  echo "  notification port: ${DEPLOY_NOTIFICATION_PORT} (127.0.0.1 only)"
  # The main API delegates to the notification service on localhost (Spec J).
  update_env_key "NOTIFICATION_URL" "http://127.0.0.1:${DEPLOY_NOTIFICATION_PORT}"

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
      run_db_migrate
    fi

    echo "Building production apps..."
    (cd "$ROOT_DIR" && pnpm build)
  else
    echo "skip  build (--skip-build)"
    verify_build_artifacts

    echo "Installing production dependencies..."
    (cd "$ROOT_DIR" && pnpm install --frozen-lockfile --prod)

    if [[ "$SKIP_MIGRATE" != true ]]; then
      run_db_migrate
    fi
  fi

  if [[ "$SKIP_BUILD" != true ]]; then
    verify_build_artifacts
  fi
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

  # After api/web and Caddy: a notification failure never holds back the API or the web app.
  local notification_failed=false
  echo
  echo "Notification container"
  echo "──────────────────────"
  if ! deploy_notification_container; then
    notification_failed=true
  fi

  echo
  echo "CI deployment complete."
  echo "  Frontend: https://${DEPLOY_FRONTEND_DOMAIN}"
  if [[ "$DEPLOY_ROUTING_MODE" == "separate" ]]; then
    echo "  API:      https://${DEPLOY_API_DOMAIN}/trpc"
  else
    echo "  API:      https://${DEPLOY_FRONTEND_DOMAIN}/trpc"
  fi

  if [[ "$notification_failed" == true ]]; then
    echo >&2
    echo "════════════════════════════════════════════════════════════════════" >&2
    echo "error: notification container failed to deploy (API and web are live)." >&2
    echo "  WhatsApp sends are not running; see the log above and" >&2
    echo "  docker logs ${NOTIFICATION_CONTAINER_NAME} on the VPS." >&2
    echo "════════════════════════════════════════════════════════════════════" >&2
    exit 1
  fi
}

main "$@"
