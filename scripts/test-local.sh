#!/usr/bin/env bash
# Runs the test suite on a throwaway local Postgres (the same image CI uses), so tests never wipe
# the motake-testing data used for click-testing. The container is removed when the run ends.
#   pnpm test:local                  every package
#   pnpm test:local --filter=@repo/services -- products   one package, matching test files
set -euo pipefail

CONTAINER=motake-test-pg
PORT=55432
IMAGE=supabase/postgres:15.8.1.085

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=motake_test \
    -p "127.0.0.1:$PORT:5432" "$IMAGE" >/dev/null
  trap 'docker stop "$CONTAINER" >/dev/null' EXIT
fi

# The image restarts Postgres once while it initialises; wait until it stays up.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
    docker exec "$CONTAINER" psql -U supabase_admin -h 127.0.0.1 -d motake_test -c 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

DATABASE_URL="postgres://supabase_admin:postgres@127.0.0.1:$PORT/motake_test" ALLOW_DB_WIPE=true \
  npx turbo test --concurrency=1 "$@"
