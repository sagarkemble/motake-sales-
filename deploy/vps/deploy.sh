#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

SKIP_BUILD=false
SKIP_CADDY=false
FORCE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--force] [--skip-build] [--skip-caddy]

Interactive VPS deployment with PM2 + Caddy.

Steps:
  1/3  Check ports (3000 web, 8000 api) and assign free ports if busy
  2/3  Configure domains, build production apps, start/restart PM2 processes
  3/3  Install Caddy reverse-proxy via deploy/vps/caddy-setup.sh

Processes managed by PM2:
  motake-api   Express API + tRPC + OpenAPI (bundled in one server)
  motake-web   Next.js frontend

Prerequisites:
  deploy/local/env-setup.sh   — root .env configured
  pnpm install                — dependencies installed
  pm2, caddy                  — installed on the server

Examples:
  ./deploy/vps/deploy.sh
  ./deploy/vps/deploy.sh --force
  ./deploy/vps/deploy.sh --skip-caddy
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-caddy)
      SKIP_CADDY=true
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

step_ports() {
  echo
  echo "Step 1/3 — Port assignment"
  echo "────────────────────────"

  assign_ports

  if [[ -f "$ENV_FILE" ]]; then
    update_env_key "PORT" "$DEPLOY_API_PORT"
    update_env_key "BASE_URL" "http://localhost:${DEPLOY_API_PORT}"
  fi

  echo "  web port: ${DEPLOY_WEB_PORT}"
  echo "  api port: ${DEPLOY_API_PORT}"
  echo "  note: tRPC runs inside motake-api (no separate process)"
}

step_domains_and_build() {
  local routing_mode=""
  local frontend_domain=""
  local api_domain=""
  local base_url=""
  local api_url=""

  echo
  echo "Step 2/3 — Domains, build, and PM2"
  echo "──────────────────────────────────"
  echo "  Paste one value at a time with Ctrl+Shift+V, then press Enter."
  echo

  echo "Routing mode:"
  echo "  1) Separate domains — e.g. app.example.com + api.example.com (recommended)"
  echo "  2) Single domain     — e.g. example.com with /trpc, /api proxied to backend"
  echo
  prompt_for_value "routing_mode" "1"

  case "$REPLY" in
    1 | separate | split)
      routing_mode="separate"
      ;;
    2 | single | path)
      routing_mode="single"
      ;;
    *)
      echo "error: choose 1 or 2" >&2
      exit 1
      ;;
  esac

  echo
  if [[ "$routing_mode" == "separate" ]]; then
    prompt_for_value "frontend_domain" "app.example.com"
    frontend_domain="$REPLY"
    validate_domain "$frontend_domain"

    prompt_for_value "api_domain" "api.example.com"
    api_domain="$REPLY"
    validate_domain "$api_domain"

    base_url="https://${api_domain}"
    api_url="https://${api_domain}/trpc"
  else
    prompt_for_value "domain" "example.com"
    frontend_domain="$REPLY"
    validate_domain "$frontend_domain"
    api_domain="$frontend_domain"
    base_url="https://${frontend_domain}"
    api_url="https://${frontend_domain}/trpc"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    update_env_key "BASE_URL" "$base_url"
    update_env_key "NEXT_PUBLIC_API_URL" "$api_url"
    update_env_key "NODE_ENV" "production"
  else
    echo "error: ${ENV_FILE} not found — run deploy/local/env-setup.sh first" >&2
    exit 1
  fi

  DEPLOY_ROUTING_MODE="$routing_mode"
  DEPLOY_FRONTEND_DOMAIN="$frontend_domain"
  DEPLOY_API_DOMAIN="$api_domain"

  if [[ "$SKIP_BUILD" != true ]]; then
    echo
    echo "Installing dependencies..."
    (cd "$ROOT_DIR" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)

    echo "Running database migrations..."
    (cd "$ROOT_DIR" && pnpm db:migrate) || echo "  warn: db:migrate failed or skipped — check DATABASE_URL"

    echo "Building production apps..."
    (cd "$ROOT_DIR" && pnpm build)
  else
    echo "skip  build (--skip-build)"
  fi

  verify_build_artifacts
  start_pm2_apps
}

step_caddy() {
  echo
  echo "Step 3/3 — Caddy reverse proxy"
  echo "─────────────────────────────"

  if [[ "$SKIP_CADDY" == true ]]; then
    echo "skip  caddy (--skip-caddy)"
    return 0
  fi

  run_caddy_setup
}

main() {
  if [[ ! -e /dev/tty ]]; then
    echo "error: interactive terminal required (run directly in a terminal)" >&2
    exit 1
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "error: ${ENV_FILE} not found — run deploy/local/env-setup.sh first" >&2
    exit 1
  fi

  require_command "pnpm" "Install Node.js 22+ and pnpm: https://pnpm.io/installation"
  require_command "pm2" "Install PM2 globally: npm install -g pm2"
  require_command "node" "Install Node.js 22+: https://nodejs.org"

  ensure_deploy_dirs
  exec 3</dev/tty

  echo "Motake deployment"
  echo "  root: ${ROOT_DIR}"

  step_ports
  step_domains_and_build
  exec 3<&-
  step_caddy

  echo
  echo "Deployment complete."
  echo "  Frontend: https://${DEPLOY_FRONTEND_DOMAIN}"
  if [[ "$DEPLOY_ROUTING_MODE" == "separate" ]]; then
    echo "  API:      https://${DEPLOY_API_DOMAIN}/trpc"
  else
    echo "  API:      https://${DEPLOY_FRONTEND_DOMAIN}/trpc"
  fi
  echo "  Web port: ${DEPLOY_WEB_PORT}  |  API port: ${DEPLOY_API_PORT}"
  echo
  echo "PM2 commands:"
  echo "  pm2 status"
  echo "  pm2 logs"
  echo "  pm2 restart ${PM2_API_NAME} ${PM2_WEB_NAME}"
}

main "$@"
