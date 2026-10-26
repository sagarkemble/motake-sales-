#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

SYSTEM_CADDYFILE="/etc/caddy/Caddyfile"
SYSTEM_SITES_DIR="/etc/caddy/sites"
SYSTEM_FRAGMENT="$SYSTEM_SITES_DIR/motake.caddy"
MOTAKE_MARKER="# motake — managed by caddy-setup.sh"
# apps/notification WHATSAPP_WEBHOOK_PATH; the only notification path that is public.
WHATSAPP_WEBHOOK_PATH="/webhooks/whatsapp"
FORCE=false
NON_INTERACTIVE=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [--force] [--non-interactive]

Interactive Caddy reverse-proxy setup for production.

This script does NOT replace /etc/caddy/Caddyfile or disturb other domains.
It writes a motake-only fragment and extends the existing Caddy setup:

  deploy/generated/motake.caddy       — local site blocks (gitignored)
  /etc/caddy/sites/motake.caddy       — system site blocks (production)

If motake is already configured, the script exits without changes.
Use --force to reconfigure motake domains only.

Prerequisites:
  1. Run deploy/local/env-setup.sh and pnpm build first
  2. DNS for your domain(s) must point to this server
  3. Ports 80 and 443 must be open
  4. Caddy installed (https://caddyserver.com/docs/install)

Non-interactive mode (used by deploy/vps/deploy.sh and deploy/ci/deploy.sh):
  MOTAKE_ROUTING_MODE=separate|single
  MOTAKE_FRONTEND_DOMAIN=app.example.com
  MOTAKE_API_DOMAIN=api.example.com   # required for separate mode
  MOTAKE_FRONTEND_PORT=3000
  MOTAKE_API_PORT=8000
  MOTAKE_NOTIFICATION_PORT=8100       # WhatsApp webhook path only
  MOTAKE_INSTALL_TARGET=system|local|skip
  MOTAKE_UPDATE_ENV=yes|no
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=true
      shift
      ;;
    --non-interactive)
      NON_INTERACTIVE=true
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

prompt_yes_no() {
  local question="$1"
  local default="${2:-n}"
  local prompt="$question"
  local value=""

  if [[ "$default" == "y" ]]; then
    prompt+=" [Y/n]: "
  else
    prompt+=" [y/N]: "
  fi

  if ! IFS= read -e -r -p "$prompt" value <&3; then
    value=""
  fi

  drain_extra_tty_input
  value="$(trim_whitespace "${value,,}")"

  if [[ -z "$value" ]]; then
    value="$default"
  fi

  [[ "$value" == "y" || "$value" == "yes" ]]
}

read_env_default() {
  local key="$1"
  local fallback="$2"

  if [[ -f "$ENV_FILE" ]] && grep -q "^${key}=" "$ENV_FILE"; then
    grep "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-
  else
    printf '%s' "$fallback"
  fi
}

read_fragment_domains() {
  local file="$1"

  if [[ ! -f "$file" ]]; then
    return 0
  fi

  grep "^# motake-domains:" "$file" 2>/dev/null | head -1 | sed 's/^# motake-domains: //'
}

motake_fragment_exists() {
  [[ -f "$MOTAKE_FRAGMENT" && -n "$(grep -F "$MOTAKE_MARKER" "$MOTAKE_FRAGMENT" 2>/dev/null || true)" ]]
}

system_fragment_exists() {
  [[ -f "$SYSTEM_FRAGMENT" && -n "$(grep -F "$MOTAKE_MARKER" "$SYSTEM_FRAGMENT" 2>/dev/null || true)" ]]
}

domain_in_caddy_tree() {
  local domain="$1"
  local file

  for file in \
    "$SYSTEM_CADDYFILE" \
    "$GENERATED_DIR"/*.caddy \
    "$SYSTEM_SITES_DIR"/*.caddy; do
    [[ -f "$file" ]] || continue
    [[ "$file" == "$MOTAKE_FRAGMENT" || "$file" == "$SYSTEM_FRAGMENT" ]] && continue
    if grep -qE "^${domain}[[:space:]]*\\{" "$file" 2>/dev/null; then
      return 0
    fi
  done

  return 1
}

check_domain_conflicts() {
  local frontend_domain="$1"
  local api_domain="$2"

  if domain_in_caddy_tree "$frontend_domain"; then
    echo "error: ${frontend_domain} is already configured in Caddy (outside motake fragment)" >&2
    return 1
  fi

  if [[ "$api_domain" != "$frontend_domain" ]] && domain_in_caddy_tree "$api_domain"; then
    echo "error: ${api_domain} is already configured in Caddy (outside motake fragment)" >&2
    return 1
  fi
}

write_separate_domains_fragment() {
  local frontend_domain="$1"
  local api_domain="$2"
  local frontend_port="$3"
  local api_port="$4"
  local notification_port="$5"

  mkdir -p "$GENERATED_DIR"

  cat >"$MOTAKE_FRAGMENT" <<EOF
${MOTAKE_MARKER}
# motake-domains: ${frontend_domain} ${api_domain}
# motake-generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Frontend: https://${frontend_domain} -> localhost:${frontend_port}
# API:      https://${api_domain} -> localhost:${api_port}
# WhatsApp: https://${api_domain}${WHATSAPP_WEBHOOK_PATH} -> localhost:${notification_port}

${frontend_domain} {
	encode gzip zstd

	reverse_proxy localhost:${frontend_port}
}

${api_domain} {
	encode gzip zstd

	# Only the Meta webhook reaches the notification container; its tRPC and Inngest stay local.
	handle ${WHATSAPP_WEBHOOK_PATH}* {
		reverse_proxy localhost:${notification_port}
	}

	handle {
		reverse_proxy localhost:${api_port}
	}
}
EOF
}

write_single_domain_fragment() {
  local domain="$1"
  local frontend_port="$2"
  local api_port="$3"
  local notification_port="$4"

  mkdir -p "$GENERATED_DIR"

  cat >"$MOTAKE_FRAGMENT" <<EOF
${MOTAKE_MARKER}
# motake-domains: ${domain}
# motake-generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Frontend: https://${domain} -> localhost:${frontend_port}
# API:      https://${domain}/trpc|/api|/docs -> localhost:${api_port}
# WhatsApp: https://${domain}${WHATSAPP_WEBHOOK_PATH} -> localhost:${notification_port}

${domain} {
	encode gzip zstd

	handle ${WHATSAPP_WEBHOOK_PATH}* {
		reverse_proxy localhost:${notification_port}
	}

	handle /trpc* {
		reverse_proxy localhost:${api_port}
	}

	handle /api* {
		reverse_proxy localhost:${api_port}
	}

	handle /docs* {
		reverse_proxy localhost:${api_port}
	}

	handle /openapi.json {
		reverse_proxy localhost:${api_port}
	}

	handle /health {
		reverse_proxy localhost:${api_port}
	}

	handle {
		reverse_proxy localhost:${frontend_port}
	}
}
EOF
}

write_local_caddyfile() {
  cat >"$LOCAL_CADDYFILE" <<EOF
# Local Caddy config — imports motake fragment only.
# Does not replace system /etc/caddy/Caddyfile.

import motake.caddy
EOF
}

system_caddyfile_has_sites_wildcard() {
  [[ -f "$SYSTEM_CADDYFILE" ]] && grep -qE 'import[[:space:]]+sites/\*\.caddy' "$SYSTEM_CADDYFILE" 2>/dev/null
}

system_caddyfile_has_motake_import() {
  [[ -f "$SYSTEM_CADDYFILE" ]] && grep -qE 'import[[:space:]]+sites/motake\.caddy' "$SYSTEM_CADDYFILE" 2>/dev/null
}

append_motake_import_to_system_caddyfile() {
  if system_caddyfile_has_sites_wildcard; then
    echo "skip  /etc/caddy/Caddyfile already imports sites/*.caddy"
    return 0
  fi

  if system_caddyfile_has_motake_import; then
    echo "skip  /etc/caddy/Caddyfile already imports sites/motake.caddy"
    return 0
  fi

  if [[ ! -f "$SYSTEM_CADDYFILE" ]]; then
    echo "error: ${SYSTEM_CADDYFILE} not found — configure Caddy for your other domains first" >&2
    return 1
  fi

  echo "append import to ${SYSTEM_CADDYFILE}"

  if [[ "$(id -u)" -ne 0 ]]; then
    {
      echo ""
      echo "# motake — added by caddy-setup.sh (does not modify existing site blocks)"
      echo "import sites/motake.caddy"
    } | sudo tee -a "$SYSTEM_CADDYFILE" >/dev/null
  else
    {
      echo ""
      echo "# motake — added by caddy-setup.sh (does not modify existing site blocks)"
      echo "import sites/motake.caddy"
    } >>"$SYSTEM_CADDYFILE"
  fi
}

install_system_fragment() {
  if [[ "$(id -u)" -ne 0 ]]; then
    sudo mkdir -p "$SYSTEM_SITES_DIR"
    sudo cp "$MOTAKE_FRAGMENT" "$SYSTEM_FRAGMENT"
    append_motake_import_to_system_caddyfile
    sudo caddy validate --config "$SYSTEM_CADDYFILE"
    if systemctl is-active --quiet caddy 2>/dev/null; then
      sudo systemctl reload caddy
      echo "reload caddy (systemd)"
    else
      echo "note: caddy service is not running — start it when ready:"
      echo "  sudo systemctl start caddy"
    fi
  else
    mkdir -p "$SYSTEM_SITES_DIR"
    cp "$MOTAKE_FRAGMENT" "$SYSTEM_FRAGMENT"
    append_motake_import_to_system_caddyfile
    caddy validate --config "$SYSTEM_CADDYFILE"
    systemctl reload caddy 2>/dev/null || true
  fi

  echo "write ${SYSTEM_FRAGMENT}"
}

install_local_fragment() {
  write_local_caddyfile
  caddy validate --config "$LOCAL_CADDYFILE"
  echo "write ${MOTAKE_FRAGMENT}"
  echo "write ${LOCAL_CADDYFILE}"

  if prompt_yes_no "Start Caddy now with deploy/generated/Caddyfile?" "y"; then
    echo "Starting Caddy (Ctrl+C to stop)..."
    caddy run --config "$LOCAL_CADDYFILE"
  else
    echo "Run manually: caddy run --config ${LOCAL_CADDYFILE}"
  fi
}

main() {
  local routing_mode=""
  local frontend_domain=""
  local api_domain=""
  local frontend_port=""
  local api_port=""
  local notification_port="${MOTAKE_NOTIFICATION_PORT:-$DEFAULT_NOTIFICATION_PORT}"
  local base_url=""
  local api_url=""
  local existing_domains=""

  if [[ "$NON_INTERACTIVE" != true && ! -e /dev/tty ]]; then
    echo "error: interactive terminal required (run directly in a terminal, not via pipe)" >&2
    exit 1
  fi

  if [[ "$NON_INTERACTIVE" != true ]]; then
    exec 3</dev/tty
  fi

  if ! command -v caddy >/dev/null 2>&1; then
    echo "error: caddy is not installed." >&2
    echo "Install: https://caddyserver.com/docs/install" >&2
    exit 1
  fi

  ensure_deploy_dirs

  if motake_fragment_exists || system_fragment_exists; then
    existing_domains="$(read_fragment_domains "$MOTAKE_FRAGMENT")"
    if [[ -z "$existing_domains" && -f "$SYSTEM_FRAGMENT" ]]; then
      existing_domains="$(read_fragment_domains "$SYSTEM_FRAGMENT")"
    fi

    if [[ "$FORCE" != true ]]; then
      echo "Motake Caddy config already exists — no changes made."
      if [[ -n "$existing_domains" ]]; then
        echo "  domains: ${existing_domains}"
      fi
      echo "  local:   ${MOTAKE_FRAGMENT}"
      echo "  system:  ${SYSTEM_FRAGMENT}"
      echo
      echo "Use --force to reconfigure motake domains only."
      exit 0
    fi

    echo "note: --force will update motake fragment only (other Caddy sites untouched)."
    echo
  fi

  frontend_port="3000"
  api_port="$(read_env_default PORT 8000)"

  if [[ "$NON_INTERACTIVE" == true ]]; then
    routing_mode="${MOTAKE_ROUTING_MODE:-separate}"
    frontend_domain="${MOTAKE_FRONTEND_DOMAIN:?MOTAKE_FRONTEND_DOMAIN is required}"
    api_domain="${MOTAKE_API_DOMAIN:-$frontend_domain}"
    frontend_port="${MOTAKE_FRONTEND_PORT:-3000}"
    api_port="${MOTAKE_API_PORT:-8000}"
    validate_domain "$frontend_domain"
    validate_domain "$api_domain"
    validate_port "$frontend_port"
    validate_port "$api_port"
    validate_port "$notification_port"
  else
    echo "Caddy reverse-proxy setup (extends existing config, does not replace it)"
    echo "  Paste one value at a time with Ctrl+Shift+V, then press Enter."
    echo

    echo "Routing mode:"
    echo "  1) Separate domains — e.g. app.example.com + api.example.com (recommended)"
    echo "  2) Single domain     — e.g. example.com with /trpc, /api proxied to backend"
    echo
    prompt_for_value "routing_mode" "1"
    routing_mode="$REPLY"

    case "$routing_mode" in
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
    else
      prompt_for_value "domain" "example.com"
      frontend_domain="$REPLY"
      validate_domain "$frontend_domain"
      api_domain="$frontend_domain"
    fi

    echo
    prompt_for_value "frontend_port" "3000"
    frontend_port="$REPLY"
    validate_port "$frontend_port"

    prompt_for_value "api_port" "$api_port"
    api_port="$REPLY"
    validate_port "$api_port"
  fi

  check_domain_conflicts "$frontend_domain" "$api_domain"

  echo
  if [[ "$routing_mode" == "separate" ]]; then
    base_url="https://${api_domain}"
    api_url="https://${api_domain}/trpc"
    write_separate_domains_fragment "$frontend_domain" "$api_domain" "$frontend_port" "$api_port" "$notification_port"
  else
    base_url="https://${frontend_domain}"
    api_url="https://${frontend_domain}/trpc"
    write_single_domain_fragment "$frontend_domain" "$frontend_port" "$api_port" "$notification_port"
  fi

  echo "write ${MOTAKE_FRAGMENT}"

  if [[ -f "$ENV_FILE" ]]; then
    local should_update=false

    if [[ "$NON_INTERACTIVE" == true ]]; then
      [[ "${MOTAKE_UPDATE_ENV:-no}" == "yes" ]] && should_update=true
    elif prompt_yes_no "Update root .env with production URLs?" "y"; then
      should_update=true
    fi

    if [[ "$should_update" == true ]]; then
      update_env_key "BASE_URL" "$base_url"
      update_env_key "NEXT_PUBLIC_API_URL" "$api_url"
      update_env_key "NODE_ENV" "production"
      if [[ "$NON_INTERACTIVE" != true ]]; then
        echo
        echo "Rebuild web after .env changes so NEXT_PUBLIC_* vars are baked in:"
        echo "  pnpm --filter web build"
      fi
    fi
  else
    echo
    echo "note: no root .env found — skipping env update (run deploy/local/env-setup.sh first)"
  fi

  if [[ "$NON_INTERACTIVE" != true ]]; then
    exec 3<&-
  fi

  echo
  echo "Motake fragment preview:"
  echo "──────────────────"
  cat "$MOTAKE_FRAGMENT"
  echo "──────────────────"
  echo

  write_local_caddyfile
  (cd "$GENERATED_DIR" && caddy validate --config "$LOCAL_CADDYFILE")
  echo "valid deploy/generated/motake.caddy"

  echo
  local install_target=""

  if [[ "$NON_INTERACTIVE" != true ]]; then
    echo "Install target:"
    echo "  1) System  — append import to /etc/caddy/Caddyfile + write /etc/caddy/sites/motake.caddy"
    echo "  2) Local   — keep deploy/generated/motake.caddy and run caddy manually"
    echo
    exec 3</dev/tty
    prompt_for_value "install_target" "1"
    exec 3<&-
    install_target="$REPLY"
  else
    install_target="${MOTAKE_INSTALL_TARGET:-system}"
  fi

  case "$install_target" in
    1 | system)
      install_system_fragment
      ;;
    2 | local)
      if [[ "$NON_INTERACTIVE" != true ]]; then
        exec 3</dev/tty
        install_local_fragment
        exec 3<&-
      else
        write_local_caddyfile
        (cd "$GENERATED_DIR" && caddy validate --config "$LOCAL_CADDYFILE")
        echo "write ${MOTAKE_FRAGMENT} (local install skipped in non-interactive mode)"
      fi
      ;;
    *)
      echo "skip  system install (fragment saved to deploy/generated/motake.caddy)"
      echo "To install later on the server:"
      echo "  sudo cp deploy/generated/motake.caddy /etc/caddy/sites/motake.caddy"
      echo "  # then append to /etc/caddy/Caddyfile:"
      echo "  import sites/motake.caddy"
      echo "  sudo systemctl reload caddy"
      ;;
  esac

  echo
  echo "Done."
  if [[ "$routing_mode" == "separate" ]]; then
    echo "  Frontend: https://${frontend_domain}"
    echo "  API:      https://${api_domain}/trpc"
  else
    echo "  Site:     https://${frontend_domain}"
    echo "  API:      https://${frontend_domain}/trpc"
  fi
  echo
  echo "Other domains in /etc/caddy/Caddyfile were not modified."
  echo "Make sure both apps are running:"
  echo "  pnpm --filter @repo/api start"
  echo "  pnpm --filter web start"
}

main "$@"
