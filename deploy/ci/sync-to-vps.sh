#!/usr/bin/env bash
set -euo pipefail

# Syncs the repository to the VPS and runs remote deploy.
# Intended to run from GitHub Actions (or locally with SSH access).

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

usage() {
  cat <<EOF
Usage: $(basename "$0")

Sync repo to VPS via rsync and run deploy/ci/write-env.sh + deploy/ci/deploy.sh.

Required environment variables:
  VPS_HOST          VPS IP or hostname
  VPS_USER          SSH user (e.g. deploy)
  VPS_APP_PATH      Remote app path (e.g. /var/www/motake)
  VPS_SSH_KEY       Private key content (optional if ssh-agent configured)

Plus all variables required by deploy/ci/write-env.sh and deploy/ci/deploy.sh.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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

for var in VPS_HOST VPS_USER VPS_APP_PATH; do
  if [[ -z "${!var:-}" ]]; then
    echo "error: ${var} is required" >&2
    exit 1
  fi
done

SSH_OPTS=(-o StrictHostKeyChecking=accept-new)

if [[ -n "${VPS_SSH_KEY:-}" ]]; then
  KEY_FILE="$(mktemp)"
  trap 'rm -f "$KEY_FILE"' EXIT
  printf '%s\n' "$VPS_SSH_KEY" >"$KEY_FILE"
  chmod 600 "$KEY_FILE"
  SSH_OPTS+=(-i "$KEY_FILE")
fi

REMOTE="${VPS_USER}@${VPS_HOST}"
RSYNC_SSH="ssh ${SSH_OPTS[*]}"

echo "Preparing remote app directory..."
ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<PREP
set -euo pipefail
APP_PATH="${VPS_APP_PATH}"
DEPLOY_USER="${VPS_USER}"

if [[ -d "\$APP_PATH" && -w "\$APP_PATH" ]]; then
  exit 0
fi

if sudo -n true 2>/dev/null; then
  sudo mkdir -p "\$APP_PATH"
  sudo chown "\${DEPLOY_USER}:\${DEPLOY_USER}" "\$APP_PATH"
  exit 0
fi

echo "error: \${APP_PATH} is missing or not writable, and deploy user has no passwordless sudo." >&2
echo "  As root on the VPS, run:" >&2
echo "    mkdir -p \${APP_PATH} && chown \${DEPLOY_USER}:\${DEPLOY_USER} \${APP_PATH}" >&2
echo "  Then install deploy sudoers from deploy/vps/sudoers-deploy-bootstrap.example" >&2
exit 1
PREP

if [[ ! -f "$ROOT_DIR/apps/api/dist/index.js" ]]; then
  echo "error: apps/api/dist/index.js missing before rsync — download build artifacts first" >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/apps/web/.next" ]]; then
  echo "error: apps/web/.next missing before rsync — download build artifacts first" >&2
  exit 1
fi

echo "Syncing to ${REMOTE}:${VPS_APP_PATH}..."

rsync -az --delete \
  -e "$RSYNC_SSH" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.turbo' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'deploy/generated' \
  "$ROOT_DIR/" "${REMOTE}:${VPS_APP_PATH}/"

echo "Running remote deploy..."

# Pass through env vars needed by write-env and deploy scripts
ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "${VPS_APP_PATH}"

export PORT="${PORT:-8000}"
export NODE_ENV="${NODE_ENV:-production}"
export LOGGER_LEVEL="${LOGGER_LEVEL:-error}"
export BASE_URL="${BASE_URL:?BASE_URL required}"
export DATABASE_URL="${DATABASE_URL:?DATABASE_URL required}"
export JWT_SECRET="${JWT_SECRET:?JWT_SECRET required}"
export SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL required}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}"
export R2_ACCOUNT_ID="${R2_ACCOUNT_ID:?R2_ACCOUNT_ID required}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID required}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY required}"
export R2_BUCKET_NAME="${R2_BUCKET_NAME:?R2_BUCKET_NAME required}"
export R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL:?R2_PUBLIC_BASE_URL required}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL required}"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL required}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY required}"
export CORS_ALLOWED_ORIGIN="${CORS_ALLOWED_ORIGIN:-}"

export MOTAKE_ROUTING_MODE="${MOTAKE_ROUTING_MODE:-separate}"
export MOTAKE_FRONTEND_DOMAIN="${MOTAKE_FRONTEND_DOMAIN:?MOTAKE_FRONTEND_DOMAIN required}"
export MOTAKE_API_DOMAIN="${MOTAKE_API_DOMAIN:?MOTAKE_API_DOMAIN required}"
export MOTAKE_FRONTEND_PORT="${MOTAKE_FRONTEND_PORT:-3000}"
export MOTAKE_API_PORT="${MOTAKE_API_PORT:-8000}"
export MOTAKE_INSTALL_TARGET="${MOTAKE_INSTALL_TARGET:-system}"

chmod +x deploy/local/env-setup.sh deploy/vps/deploy.sh deploy/vps/caddy-setup.sh
chmod +x deploy/ci/write-env.sh deploy/ci/deploy.sh deploy/ci/sync-to-vps.sh deploy/ci/ensure-production.sh
chmod +x deploy/pm2/start-api.sh deploy/pm2/start-web.sh

export VPS_APP_PATH="${VPS_APP_PATH:-/var/www/motake}"
export DEPLOY_USER="${VPS_USER:-deploy}"

./deploy/ci/ensure-production.sh --quiet
./deploy/ci/write-env.sh
./deploy/ci/deploy.sh --skip-build
REMOTE_SCRIPT

echo "Remote deploy finished."
