# Motake K6 load tests

Production-oriented load tests for the deployed Motake API (`/api/*`).

## Prerequisites

1. [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) **v0.47+ or v2.x**
   - Scripts use built-in modules only (`k6`, `k6/http`, `k6/data`) — no `k6/utils` (removed in k6 v2).
2. Copy user credentials:
   ```bash
   cp k6/data/users.example.json k6/data/users.json
   ```
3. Fill `k6/data/users.json`:
   - **1 admin** account (`app_metadata.role = admin`)
   - **Up to 100 salesman** accounts (cycle if fewer than VU count)

`k6/data/users.json` is gitignored.

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

All requests go through the backend only:

1. `POST /api/auth/login` with email + password → httpOnly session cookie
2. All `/api/*` requests use the VU cookie jar

No direct Supabase or database access from K6.

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
