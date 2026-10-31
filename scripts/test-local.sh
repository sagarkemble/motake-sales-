#!/usr/bin/env bash
# Runs the test suite on the local Postgres (not Docker), so tests never wipe the motake-testing
# data used for click-testing. The database is created once with:
#   sudo -u postgres psql -c "CREATE ROLE motake_test LOGIN PASSWORD 'motake_test' CREATEDB" \
#     -c "CREATE DATABASE motake_test OWNER motake_test"
# Plain Postgres has no Supabase Vault, so the WhatsApp token files are skipped here; CI runs them.
#   pnpm test:local                  every package
#   pnpm test:local --filter=@repo/services -- products   one package, matching test files
set -euo pipefail

DATABASE_URL="${TEST_DATABASE_URL:-postgres://motake_test:motake_test@127.0.0.1:5432/motake_test}" \
  ALLOW_DB_WIPE=true SKIP_VAULT_TESTS=true npx turbo test --concurrency=1 "$@"
