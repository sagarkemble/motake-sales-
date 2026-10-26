#!/usr/bin/env bash
# Runs the self-hosted Inngest server and the notification app side by side. If either exits, the
# other is stopped and the container exits, so Docker (--restart unless-stopped) brings both back.
set -euo pipefail

: "${INNGEST_EVENT_KEY:?INNGEST_EVENT_KEY is required}"
: "${INNGEST_SIGNING_KEY:?INNGEST_SIGNING_KEY is required}"

inngest start \
  --port "${INNGEST_PORT:-8288}" \
  --event-key "${INNGEST_EVENT_KEY}" \
  --signing-key "${INNGEST_SIGNING_KEY}" \
  --sdk-url "http://127.0.0.1:${PORT:-8100}/api/inngest" \
  --sqlite-dir /var/lib/inngest &
inngest_pid=$!

node /app/dist/index.js &
app_pid=$!

stop_all() {
  kill -TERM "$inngest_pid" "$app_pid" 2>/dev/null || true
}
trap stop_all TERM INT

set +e
wait -n "$inngest_pid" "$app_pid"
exit_status=$?
set -e

echo "notification container: a process exited (status ${exit_status}); stopping" >&2
stop_all
wait || true
exit "$exit_status"
