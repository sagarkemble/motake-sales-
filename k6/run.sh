#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# k6 open() resolves relative paths from the script file (k6/lib/), not cwd.
# Always export an absolute path so K6_USERS_FILE works regardless of .env value.
DEFAULT_USERS_FILE="${ROOT_DIR}/k6/data/users.json"
if [[ -n "${K6_USERS_FILE:-}" ]]; then
  if [[ "${K6_USERS_FILE}" = /* ]]; then
    USERS_FILE="${K6_USERS_FILE}"
  else
    USERS_FILE="${ROOT_DIR}/${K6_USERS_FILE#./}"
  fi
else
  USERS_FILE="${DEFAULT_USERS_FILE}"
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "error: k6 is not installed." >&2
  echo "  Install: https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2
  echo "  Ubuntu:  sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17A75AB366BBDBF27022CA9B7C5387FE843C && echo \"deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main\" | sudo tee /etc/apt/sources.list.d/k6.list && sudo apt-get update && sudo apt-get install k6" >&2
  exit 1
fi

if [[ ! -f "${USERS_FILE}" ]]; then
  echo "error: missing ${USERS_FILE}" >&2
  echo "  cp k6/data/users.example.json k6/data/users.json" >&2
  echo "  Then add admin + salesman credentials for load testing." >&2
  exit 1
fi

cd "${ROOT_DIR}"
export K6_USERS_FILE="${USERS_FILE}"

# k6 reads __ENV at runtime; dotenv must export vars for the k6 process.
API_TARGET="${K6_API_BASE_URL:-${BASE_URL:-http://localhost:8000}}"
API_TARGET="${API_TARGET%/}"
echo "K6 API target: ${API_TARGET}"

if [[ "${API_TARGET}" == *"localhost"* || "${API_TARGET}" == *"127.0.0.1"* ]]; then
  echo "warning: load test is pointed at a local API (${API_TARGET})." >&2
  echo "  If the API is not running locally, set in .env:" >&2
  echo "    K6_API_BASE_URL=https://sales-api.motakedairy.com" >&2
fi

export K6_API_BASE_URL="${K6_API_BASE_URL:-${API_TARGET}}"

if [[ "${K6_SKIP_CLEANUP:-0}" != "1" ]]; then
  echo "Cleaning up data from previous load test runs..."
  if ! node "${ROOT_DIR}/scripts/cleanup-k6-data.mjs"; then
    echo "error: k6 data cleanup failed — aborting load test." >&2
    exit 1
  fi
fi

if [[ "${K6_SKIP_TOKEN_FETCH:-0}" != "1" ]]; then
  echo "Fetching access tokens for load-test users..."
  if ! node "${ROOT_DIR}/scripts/fetch-k6-tokens.mjs"; then
    echo "error: token pre-fetch failed — aborting load test." >&2
    exit 1
  fi
fi

exec k6 run k6/load-test.js "$@"