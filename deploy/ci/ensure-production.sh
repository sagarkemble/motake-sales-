#!/usr/bin/env bash
set -euo pipefail

# Ensures VPS production dependencies exist before CI deploy.
# Run on the VPS (invoked by deploy/ci/sync-to-vps.sh over SSH).

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

CHECK_ONLY=false
FORCE=false
QUIET=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--check-only] [--force] [--quiet]

Ensure Node.js, pnpm, PM2, Caddy, and related tools are installed on the VPS.

Environment:
  VPS_APP_PATH              App directory (default: /var/www/motake)
  DEPLOY_USER               Deploy user (default: current user)
  REQUIRED_NODE_MAJOR       Node major version (default: 22)
  REQUIRED_PNPM_VERSION     pnpm version (default: 9.0.0)

Options:
  --check-only   Report missing dependencies only; do not install
  --force        Re-run installers even when tools appear present
  --quiet        Minimal output (for CI logs)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --quiet)
      QUIET=true
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

export QUIET
export VPS_APP_PATH="${VPS_APP_PATH:-/var/www/motake}"
export DEPLOY_USER="${DEPLOY_USER:-${USER:-deploy}}"

# shellcheck disable=SC1091
source "$DEPLOY_DIR/lib/production-deps.sh"

main() {
  log_step "Ensuring production dependencies on VPS"
  log_info "  app path: ${VPS_APP_PATH}"
  log_info "  user:     ${DEPLOY_USER}"
  log_info ""

  if [[ "$CHECK_ONLY" == true ]]; then
    if collect_missing_deps; then
      print_versions
      exit 0
    fi
    exit 1
  fi

  if [[ "$FORCE" != true ]] && collect_missing_deps; then
    print_versions
    log_info "Nothing to install."
    exit 0
  fi

  log_info ""
  log_step "Installing missing production dependencies..."

  install_missing_deps

  if ! verify_all_deps; then
    echo "error: production dependency verification failed" >&2
    exit 1
  fi

  print_versions
  log_info ""
  log_info "Production dependencies ready."
}

main "$@"
