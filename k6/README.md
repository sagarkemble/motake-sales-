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
| `K6_API_BASE_URL` | `BASE_URL` | API origin, e.g. `https://sales-api.motakedairy.com` |
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
| `salesmen_daily_workflow` | 10 | Login → gatepass → catalog → customers → orders → **create customer (25%)** → **handover reconciliation (~23%)** → optional book-now / fulfill |
| `admin_dashboard_workflow` | 2 | Login → reports → gatepass oversight → lists → optional customer update → **approve / flag handovers (~28%)** → gatepass allot |

### Write operations

| Action | Role | Endpoint | Frequency |
|--------|------|----------|-----------|
| Shop photo upload URL | Salesman / Admin | `POST /api/customers/shop-photo-upload-url` | before every customer create |
| Create customer (with photo) | Salesman | `POST /api/customers/` | ~25% of iterations |
| Create customer (with photo) | Admin | `POST /api/customers/` | ~8% |
| Book-now order | Salesman | `POST /api/orders/book-now` | ~10% (when stock + customer exist) |
| Fulfill order | Salesman | `PATCH /api/orders/:id/fulfill` | ~5% |
| Update customer (+ replace photo) | Admin | `PATCH /api/customers/:id` | ~8% |
| Remove shop photo | Admin | `DELETE /api/customers/:id/shop-photo` | ~3% |
| Submit handover — full return | Salesman | `POST /api/gatepasses/:id/handover` | ~5% (when gatepass active) |
| Submit handover — partial + short reason | Salesman | `POST /api/gatepasses/:id/handover` | ~3% (when gatepass active) |
| Approve handover | Admin | `PATCH /api/gatepasses/:id/verify` | ~6% (when one is pending) |
| Flag handover as discrepancy | Admin | `PATCH /api/gatepasses/:id/flag` | ~6% (when one is pending) |
| Re-allot gatepass (multiple/day) | Admin | `POST /api/gatepasses/allot` | ~6% (salesman with no active gatepass) |
| Allot gatepass | Admin | `POST /api/gatepasses/allot` | ~5% |

A **shop photo is required** to create a customer: every create first requests a presigned
upload URL, then sends the returned `shopPhotoKey`. Photo **replace/remove is admin-only**;
salesmen can create with a photo but cannot mutate it afterwards.

### Shop photo edge cases (negative / authorization)

These low-frequency branches send intentionally invalid input and assert the rejection status
(via `http.expectedStatuses`), so an expected 4xx counts as a pass rather than a failed check:

| Check tag | Role | Expected | What it verifies |
|-----------|------|----------|------------------|
| `customer_shop_photo_bad_type` | Salesman / Admin | 400 | Unsupported content type (`image/gif`) is rejected |
| `customer_shop_photo_too_large` | Salesman / Admin | 400 | File over the 5 MB cap is rejected |
| `customer_create_no_city` | Salesman | 400 | Create without `cityId` is rejected (City required; the shop photo is optional) |
| `customer_create_forged_key` | Salesman | 403 | A `shopPhotoKey` owned by another user is rejected |
| `customer_update_forbidden` | Salesman | 403 | Salesman cannot `PATCH` a customer photo (admin only) |
| `customer_delete_photo_forbidden` | Salesman | 403 | Salesman cannot delete a customer photo (admin only) |
| `customer_delete_photo` | Admin | 200 | Photo cleared via delete endpoint (`shopPhotoUrl`/`shopPhotoKey` null) |
| `customer_clear_photo` | Admin | 200 | Photo cleared via `PATCH shopPhotoKey:null` (nullable path) |

Positive assertions also confirm that created customers carry a non-empty `shopPhotoUrl`, and
that customer lists, order lists (`customerShopPhotoUrl`), and order details expose the photo field.

### Handover reconciliation

The end-of-day handover is a state machine (`active → pending_verification → closed`). The
salesman declares what is actually being returned per item — defaulting to the amount due back
(`issued − sold`) — and must give a reason for any shortfall. The admin then either **approves**
(closes clean) or **flags a discrepancy** (closes with a reason for follow-up).

A salesman may hold **multiple gatepasses on the same business date**, but only **one active at a
time** (enforced by a partial unique index on `(salesman_id, business_date) WHERE status = 'active'`).
The real-world flow is sequential: get stock → sell → hand over → get re-allotted a fresh gatepass.
So a handed-over/closed gatepass is frozen (a second handover returns `409`), and re-allotment is
only allowed once the salesman has **no active gatepass** (allotting while one is active returns `409`).

Because a gatepass can only be handed over once and both scenarios run concurrently, the
happy-path branches accept the realistic set of outcomes (e.g. `409` when another VU already
handed over / closed it) and only run their success assertions on a `200`. The negative branches
assert the rejection status directly.

**Salesman — `POST /api/gatepasses/:id/handover`:**

| Check tag | Expected | What it verifies |
|-----------|----------|------------------|
| `handover_full` | 200 / 409 / 404 | Full return moves the gatepass to `pending_verification` with `handoverSubmittedAt` set |
| `handover_partial` | 200 / 409 / 404 | Partial return with a `shortReason` on one item is accepted |
| `handover_short_no_reason` | 400 / 409 / 404 | A shortfall without a reason is rejected |
| `handover_over_return` | 400 / 409 / 404 | Returning more than is due back (`> issued − sold`) is rejected |
| `handover_foreign_item` | 400 / 409 / 404 | A `gatepassItemId` not on this gatepass is rejected |
| `handover_not_found` | 404 | Handover against an unknown gatepass id is not found |
| `handover_not_active_resubmit` | 409 | A non-active (handed-over / closed) gatepass cannot be handed over again |
| `handover_verify_forbidden` | 401 / 403 | Salesman cannot `PATCH …/verify` (admin only) |
| `handover_flag_forbidden` | 401 / 403 | Salesman cannot `PATCH …/flag` (admin only) |

**Admin — `PATCH /api/gatepasses/:id/verify` and `/flag`:**

| Check tag | Expected | What it verifies |
|-----------|----------|------------------|
| `handover_approve` | 200 / 409 | Approving a pending handover closes it with `hasDiscrepancy=false` |
| `handover_flag` | 200 / 409 | Flagging closes it with `hasDiscrepancy=true` + non-empty `discrepancyReason` |
| `handover_approve_not_pending` | 409 | Approving a gatepass that is not awaiting verification is rejected |
| `handover_flag_no_reason` | 400 | Flagging with an empty `reason` is rejected by validation |
| `handover_verify_not_found` | 404 | Verifying an unknown gatepass id is not found |
| `handover_flag_not_found` | 404 | Flagging an unknown gatepass id is not found |
| `gatepass_reallot_after_handover` | 200 / 409 | Re-allotting to a salesman with **no active** gatepass creates a fresh, distinct active gatepass (multiple/day) |
| `gatepass_allot_active_conflict` | 409 / 200 | Allotting while the salesman already holds an **active** gatepass is rejected (one active/day) |
| `gatepass_discrepancies` | 200 | Admin discrepancy dashboard data (`GET /api/gatepasses/discrepancies`) returns flagged gatepasses with salesman, reason, and issued/sold/returned/short totals |

Positive assertions also confirm the salesman's own gatepass items expose the new
`returnedQty` / `shortReason` / `shortNote` fields, and that returned items stay within
`0 ≤ returnedQty ≤ issued − sold`.

## Auth

All requests go through the backend only, and **no password or session logins happen during the test**:

1. `pnpm loadtest` first runs `scripts/fetch-k6-tokens.mjs`, which logs in each required user
   once via `POST /api/auth/login` (exponential backoff + jitter on 429/5xx) and stores the
   access tokens in `k6/data/users.json`. Only `K6_ADMIN_VUS` admins + `K6_SALESMAN_VUS`
   salesmen are logged in, keeping well under Supabase's sign-in rate limit.
2. Each VU plants its stored token into the cookie jar as `authentication-token` (no
   `POST /api/auth/session`).
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
