# Motake K6 load tests

Production-oriented load tests for the deployed Motake API (`/api/*`).

## Prerequisites

1. [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) **v0.47+ or v2.x**
   - Scripts use built-in modules only (`k6`, `k6/http`, `k6/data`) — no `k6/utils` (removed in k6 v2).
2. Seed load-test users (counts come from `K6_ADMIN_VUS` / `K6_SALESMAN_VUS` in `.env`,
   overridable with `SEED_ADMIN_COUNT` / `SEED_SALESMAN_COUNT`):
   ```bash
   pnpm seed:k6-users
   ```
   This writes `k6/data/users.json` (gitignored). Access tokens are fetched automatically
   at the start of every `pnpm loadtest` run.

## Environment

Loaded via root `.env` when using `pnpm loadtest`:

| Variable | Default | Description |
|----------|---------|-------------|
| `K6_API_BASE_URL` | `BASE_URL` | API origin, e.g. `https://motake-back.lunarstudio.dev` |
| `K6_SALESMAN_VUS` | `10` | Concurrent salesman virtual users |
| `K6_ADMIN_VUS` | `2` | Concurrent admin virtual users |
| `K6_RAMP_UP` | `2m` | Ramp-up duration |
| `K6_HOLD_DURATION` | `5m` | Steady-state duration |
| `K6_RAMP_DOWN` | `1m` | Ramp-down duration |
| `K6_USERS_FILE` | `k6/data/users.json` | Credential pool |

## Run

```bash
pnpm loadtest
```

Smoke run (fewer VUs, shorter hold):

```bash
K6_SALESMAN_VUS=5 K6_ADMIN_VUS=2 K6_HOLD_DURATION=30s pnpm loadtest
```

## Scenarios

| Scenario | VUs | Flow |
|----------|-----|------|
| `salesmen_daily_workflow` | 10 | Login → gatepass → catalog → customers → orders → **create customer (25%)** → optional book-now / fulfill |
| `admin_dashboard_workflow` | 2 | Login → reports → gatepass oversight → lists → optional customer update / gatepass allot |

### Write operations

| Action | Role | Endpoint | Frequency |
|--------|------|----------|-----------|
| Create customer | Salesman | `POST /api/customers/` | ~25% of iterations |
| Book-now order | Salesman | `POST /api/orders/book-now` | ~10% (when stock + customer exist) |
| Fulfill order | Salesman | `PATCH /api/orders/:id/fulfill` | ~5% |
| Update customer | Admin | `PATCH /api/customers/:id` | ~5% |
| Allot gatepass | Admin | `POST /api/gatepasses/allot` | ~5% |

Customer creation is **salesman-only** (shared customer list per product rules). Admins list and update customers but do not create them.

## Auth

All requests go through the backend only, and **no password logins happen during the test**:

1. `pnpm loadtest` first runs `scripts/fetch-k6-tokens.mjs`, which logs in each required user
   once via `POST /api/auth/login` (exponential backoff + jitter on 429/5xx) and stores the
   access tokens in `k6/data/users.json`. Only `K6_ADMIN_VUS` admins + `K6_SALESMAN_VUS`
   salesmen are logged in, keeping well under Supabase's sign-in rate limit.
2. Each VU exchanges its stored token via `POST /api/auth/session` → httpOnly session cookie.
3. All `/api/*` requests reuse the VU cookie jar.

Supabase access tokens expire (~1 hour), so tokens are refreshed automatically at the start
of every `pnpm loadtest`. To skip the refresh (tokens still fresh): `K6_SKIP_TOKEN_FETCH=1 pnpm loadtest`.
Manual refresh: `pnpm tokens:k6`.

## Notes

- Prefer off-peak windows for production load tests.
- Writes use unique data / idempotency keys where possible.
- Book-now and gatepass writes only run when stock/data exists (avoids artificial failures).
- **K6 does not auto-clean** — test customers, orders, gatepass allotments, and users remain in the DB.

## Cleanup after load tests

Remove all K6-tagged data and load-test users via the backend API (`POST /api/admin/k6-cleanup`):

```bash
# Preview what would be deleted (no changes)
pnpm cleanup:k6

# Actually delete (production — requires explicit confirm)
CLEANUP_CONFIRM=1 pnpm cleanup:k6
```

The cleanup script authenticates as admin through the backend and delegates all database/Supabase work to the API.
