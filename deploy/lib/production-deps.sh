#!/usr/bin/env bash
# VPS production dependency checks and installers.
# Sourced by deploy/ci/ensure-production.sh

REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-22}"
REQUIRED_PNPM_VERSION="${REQUIRED_PNPM_VERSION:-9.0.0}"
VPS_APP_PATH="${VPS_APP_PATH:-/var/www/motake}"
DEPLOY_USER="${DEPLOY_USER:-${USER:-deploy}}"

MISSING_DEPS=()

log_info() {
  [[ "${QUIET:-false}" == true ]] || echo "$*"
}

log_step() {
  echo "==> $*"
}

log_ok() {
  [[ "${QUIET:-false}" == true ]] || echo "  ✓ $*"
}

log_miss() {
  echo "  ✗ $*"
}

require_sudo() {
  if sudo -n true 2>/dev/null; then
    return 0
  fi

  echo "error: passwordless sudo is required for production bootstrap." >&2
  echo "  On a fresh VPS, SSH as root once and run:" >&2
  echo "    sudo cp deploy/vps/sudoers-deploy-bootstrap.example /etc/sudoers.d/deploy-motake" >&2
  echo "    sudo chmod 440 /etc/sudoers.d/deploy-motake" >&2
  echo "    sudo mkdir -p ${VPS_APP_PATH} && sudo chown ${DEPLOY_USER}:${DEPLOY_USER} ${VPS_APP_PATH}" >&2
  exit 1
}

version_ge() {
  local current="$1"
  local required="$2"
  printf '%s\n%s\n' "$required" "$current" | sort -C -V
}

node_major_version() {
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

pnpm_version() {
  pnpm -v 2>/dev/null | sed 's/^v//'
}

check_curl() {
  command -v curl >/dev/null 2>&1
}

check_rsync() {
  command -v rsync >/dev/null 2>&1
}

check_git() {
  command -v git >/dev/null 2>&1
}

check_node() {
  local major

  command -v node >/dev/null 2>&1 || return 1
  major="$(node_major_version)"
  [[ -n "$major" && "$major" -ge "$REQUIRED_NODE_MAJOR" ]]
}

check_npm() {
  command -v npm >/dev/null 2>&1
}

check_pnpm() {
  local version

  command -v pnpm >/dev/null 2>&1 || return 1
  version="$(pnpm_version)"
  [[ "$version" == "$REQUIRED_PNPM_VERSION" || "$version" == "${REQUIRED_PNPM_VERSION}"* ]]
}

check_pm2() {
  command -v pm2 >/dev/null 2>&1
}

check_caddy() {
  command -v caddy >/dev/null 2>&1
}

check_caddy_service() {
  systemctl is-enabled caddy >/dev/null 2>&1
}

check_app_directory() {
  [[ -d "$VPS_APP_PATH" ]] && [[ -w "$VPS_APP_PATH" ]]
}

check_pm2_startup() {
  systemctl list-unit-files 2>/dev/null | grep -qE '^pm2-.*\.service'
}

check_ufw() {
  command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"
}

run_dep_check() {
  local name="$1"
  local fn="$2"

  if "$fn"; then
    log_ok "$name"
    return 0
  fi

  log_miss "$name (missing or outdated)"
  MISSING_DEPS+=("$name")
  return 1
}

collect_missing_deps() {
  MISSING_DEPS=()

  log_info "Production dependency check"
  log_info "───────────────────────────"

  run_dep_check "curl" check_curl || true
  run_dep_check "rsync" check_rsync || true
  run_dep_check "git" check_git || true
  run_dep_check "node (>= ${REQUIRED_NODE_MAJOR})" check_node || true
  run_dep_check "npm" check_npm || true
  run_dep_check "pnpm (${REQUIRED_PNPM_VERSION})" check_pnpm || true
  run_dep_check "pm2" check_pm2 || true
  run_dep_check "caddy" check_caddy || true
  run_dep_check "caddy service" check_caddy_service || true
  run_dep_check "app directory (${VPS_APP_PATH})" check_app_directory || true
  run_dep_check "pm2 startup (systemd)" check_pm2_startup || true

  if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
    log_info ""
    log_info "Missing or outdated: ${MISSING_DEPS[*]}"
    return 1
  fi

  log_info ""
  log_info "All production dependencies satisfied."
  return 0
}

install_apt_base_packages() {
  if check_curl && check_rsync && check_git; then
    return 0
  fi

  log_step "Installing base packages (curl, rsync, git, build-essential)..."
  require_sudo
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl ca-certificates gnupg rsync git build-essential \
    debian-keyring debian-archive-keyring apt-transport-https
}

install_node() {
  if check_node && check_npm; then
    log_info "skip  node (already satisfied)"
    return 0
  fi

  log_step "Installing Node.js ${REQUIRED_NODE_MAJOR}.x..."
  require_sudo
  curl -fsSL "https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x" | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_pnpm() {
  if check_pnpm; then
    log_info "skip  pnpm (already satisfied)"
    return 0
  fi

  log_step "Installing pnpm ${REQUIRED_PNPM_VERSION} via corepack..."
  require_sudo
  sudo corepack enable
  sudo corepack prepare "pnpm@${REQUIRED_PNPM_VERSION}" --activate
}

install_pm2() {
  if check_pm2; then
    log_info "skip  pm2 (already satisfied)"
    return 0
  fi

  log_step "Installing PM2 globally..."
  npm install -g pm2
}

install_caddy() {
  if check_caddy; then
    log_info "skip  caddy binary (already satisfied)"
  else
    log_step "Installing Caddy..."
    require_sudo

    if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    fi

    if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    fi

    sudo apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
  fi

  if ! check_caddy_service; then
    log_step "Enabling Caddy service..."
    require_sudo
    sudo systemctl enable caddy
    sudo systemctl start caddy
  fi
}

ensure_app_directory() {
  if check_app_directory; then
    log_info "skip  app directory (already satisfied)"
    return 0
  fi

  log_step "Ensuring app directory ${VPS_APP_PATH}..."
  require_sudo
  sudo mkdir -p "$VPS_APP_PATH"
  sudo chown "${DEPLOY_USER}:${DEPLOY_USER}" "$VPS_APP_PATH"
}

ensure_pm2_startup() {
  if check_pm2_startup; then
    log_info "skip  pm2 startup (already satisfied)"
    return 0
  fi

  if ! check_pm2; then
    echo "error: pm2 must be installed before configuring startup" >&2
    return 1
  fi

  log_step "Configuring PM2 systemd startup for ${DEPLOY_USER}..."
  require_sudo

  local startup_output startup_cmd
  startup_output="$(pm2 startup systemd -u "${DEPLOY_USER}" --hp "/home/${DEPLOY_USER}" 2>&1 || true)"
  startup_cmd="$(printf '%s\n' "$startup_output" | grep -E '^sudo env' | tail -1)"

  if [[ -z "$startup_cmd" ]]; then
    echo "error: could not determine pm2 startup command" >&2
    printf '%s\n' "$startup_output" >&2
    return 1
  fi

  eval "$startup_cmd"
}

ensure_deploy_sudoers() {
  local caddy_bin sudoers_file="/etc/sudoers.d/deploy-motake"

  if [[ -f "$sudoers_file" ]]; then
    log_info "skip  deploy sudoers (already present)"
    return 0
  fi

  log_step "Installing deploy sudoers for Caddy management..."
  require_sudo

  caddy_bin="$(command -v caddy || echo /usr/bin/caddy)"

  sudo tee "$sudoers_file" >/dev/null <<EOF
# Motake deploy user — Caddy + deploy bootstrap (managed by ensure-production.sh)
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /bin/systemctl, ${caddy_bin}, /bin/cp, /bin/mkdir, /bin/chown, /bin/chmod, /usr/bin/corepack, /usr/bin/gpg, /usr/bin/tee
EOF
  sudo chmod 440 "$sudoers_file"
}

ensure_ufw() {
  if check_ufw; then
    log_info "skip  ufw (already active)"
    return 0
  fi

  if ! command -v ufw >/dev/null 2>&1; then
    log_step "Installing ufw..."
    require_sudo
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ufw
  fi

  log_step "Configuring firewall (OpenSSH, 80, 443)..."
  require_sudo
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
}

install_missing_deps() {
  install_apt_base_packages
  install_node
  install_pnpm
  install_pm2
  install_caddy
  ensure_app_directory
  ensure_pm2_startup
  ensure_deploy_sudoers
  ensure_ufw
}

verify_all_deps() {
  log_info ""
  log_info "Production dependency verify"
  log_info "────────────────────────────"

  local failed=0

  run_dep_check "curl" check_curl || failed=1
  run_dep_check "rsync" check_rsync || failed=1
  run_dep_check "git" check_git || failed=1
  run_dep_check "node (>= ${REQUIRED_NODE_MAJOR})" check_node || failed=1
  run_dep_check "npm" check_npm || failed=1
  run_dep_check "pnpm (${REQUIRED_PNPM_VERSION})" check_pnpm || failed=1
  run_dep_check "pm2" check_pm2 || failed=1
  run_dep_check "caddy" check_caddy || failed=1
  run_dep_check "caddy service" check_caddy_service || failed=1
  run_dep_check "app directory (${VPS_APP_PATH})" check_app_directory || failed=1
  run_dep_check "pm2 startup (systemd)" check_pm2_startup || failed=1

  return "$failed"
}

print_versions() {
  log_info ""
  log_info "Installed versions:"
  command -v node >/dev/null && log_info "  node  $(node -v)"
  command -v npm >/dev/null && log_info "  npm   $(npm -v)"
  command -v pnpm >/dev/null && log_info "  pnpm  $(pnpm -v)"
  command -v pm2 >/dev/null && log_info "  pm2   $(pm2 -v | head -1)"
  command -v caddy >/dev/null && log_info "  caddy $(caddy version 2>/dev/null | head -1)"
}
