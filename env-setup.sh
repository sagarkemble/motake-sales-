#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
ENV_FILE="$ROOT_DIR/.env"
FORCE=false

SYMLINK_TARGETS=(
  "apps/api/.env"
  "apps/web/.env.local"
  "packages/database/.env"
  "packages/services/.env"
  "packages/logger/.env"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") [--force]

Interactive environment setup for the monorepo:

  1. Reads .env.example and prompts for each variable (defaults shown in brackets)
  2. Writes root .env with your values
  3. Symlinks root .env into each app/package that needs it

  --force   Re-prompt for all values and overwrite existing .env / symlinks

Root:
  .env.example   Template with default values (committed)
  .env           Local secrets (gitignored)

Symlinks created:
  apps/api/.env              -> ../../.env
  apps/web/.env.local        -> ../../.env
  packages/database/.env     -> ../../.env
  packages/services/.env     -> ../../.env
  packages/logger/.env       -> ../../.env

Then run: pnpm dev
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

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "error: $ENV_EXAMPLE not found" >&2
  exit 1
fi

trim_whitespace() {
  local input="$1"
  input="${input#"${input%%[![:space:]]*}"}"
  input="${input%"${input##*[![:space:]]}"}"
  printf '%s' "$input"
}

normalize_pasted_value() {
  local key="$1"
  local value="$2"

  value="${value//$'\r'/}"

  if [[ "$value" == *$'\n'* ]]; then
    echo "  note: multi-line paste detected; using the first line only." >&2
    value="${value%%$'\n'*}"
  fi

  if [[ "$value" =~ ^${key}=(.*)$ ]]; then
    value="${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*=(.*)$ ]]; then
    echo "  note: extracted value from pasted KEY=value line." >&2
    value="${BASH_REMATCH[1]}"
  fi

  trim_whitespace "$value"
}

drain_extra_tty_input() {
  local extra=""

  while true; do
    if ! IFS= read -r -t 0.01 extra <&3; then
      break
    fi

    extra="$(trim_whitespace "${extra//$'\r'/}")"
    if [[ -n "$extra" ]]; then
      echo "  ! ignored extra pasted input (paste one value per prompt): $extra" >&2
    fi
  done
}

prompt_for_value() {
  local key="$1"
  local default="$2"
  local value=""
  local prompt="  $key"

  if [[ -n "$default" ]]; then
    prompt+=" [$default]"
  fi
  prompt+=": "

  if ! IFS= read -e -r -p "$prompt" value <&3; then
    value=""
  fi

  value="$(normalize_pasted_value "$key" "$value")"
  drain_extra_tty_input

  if [[ -z "$value" ]]; then
    value="$default"
  fi

  REPLY="$value"
}

create_env_from_prompts() {
  local -a example_lines=()
  local -a output_lines=()
  local line key default

  if [[ ! -e /dev/tty ]]; then
    echo "error: interactive terminal required (run directly in a terminal, not via pipe)" >&2
    exit 1
  fi

  exec 3</dev/tty

  mapfile -t example_lines <"$ENV_EXAMPLE"

  echo
  echo "Configure environment variables."
  echo "  - Press Enter to accept the default shown in [brackets]."
  echo "  - Paste one value at a time with Ctrl+Shift+V, then press Enter."
  echo

  for line in "${example_lines[@]}"; do
    if [[ "$line" =~ ^[[:space:]]*# ]]; then
      output_lines+=("$line")
      if [[ "$line" =~ ^#\ ---\  ]]; then
        echo
        echo "${line#\# }"
      fi
      continue
    fi

    if [[ -z "${line//[[:space:]]/}" ]]; then
      output_lines+=("")
      continue
    fi

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      default="${BASH_REMATCH[2]}"
      prompt_for_value "$key" "$default"
      output_lines+=("$key=$REPLY")
      continue
    fi

    output_lines+=("$line")
  done

  exec 3<&-

  printf '%s\n' "${output_lines[@]}" >"$ENV_FILE"
  echo
  echo "write .env"
}

create_symlink() {
  local target_rel="$1"
  local target="$ROOT_DIR/$target_rel"
  local link_target="../../.env"

  mkdir -p "$(dirname "$target")"

  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -L "$target" ]]; then
      if [[ "$FORCE" != true ]]; then
        echo "skip  $target_rel (symlink already exists; use --force to replace)"
        return 0
      fi
      rm "$target"
    elif [[ -f "$target" ]]; then
      if [[ "$FORCE" != true ]]; then
        echo "skip  $target_rel (file already exists; use --force to replace with symlink)"
        return 0
      fi
      rm "$target"
    else
      if [[ "$FORCE" != true ]]; then
        echo "skip  $target_rel (path exists; use --force to replace)"
        return 0
      fi
      rm -rf "$target"
    fi
  fi

  ln -sf "$link_target" "$target"
  echo "link  $target_rel -> $link_target"
}

if [[ -f "$ENV_FILE" && "$FORCE" != true ]]; then
  echo "skip  .env (already exists; use --force to reconfigure)"
else
  create_env_from_prompts
fi

echo
echo "Creating symlinks..."
for target_rel in "${SYMLINK_TARGETS[@]}"; do
  create_symlink "$target_rel"
done

echo
echo "Done."
echo "Root env file: $ENV_FILE"
echo "Run: pnpm dev"
