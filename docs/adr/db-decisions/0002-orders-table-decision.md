# Orders store the sale only; tax, IRN, and letterhead live on bills

`orders` is the sale or Pre-order (`docs/adr/db-decisions/0004-order-and-bill-are-separate.md`). Status may change. Frozen print stamps, GST amounts, `legal_type`, `bill_date`, `MB` number, and IRN are not on this row — they belong on `bills` (`docs/adr/db-decisions/0005-bills-table-decision.md`).

No letterhead blob on `orders`. Live FKs stay columns.

## Columns

**IDs / who:** `id`, `type`, `status`, `salesman_id`, `customer_id`, `route_id`, `gatepass_id`, `fulfilled_by`, `cancelled_by`

**Dates / ops:** `scheduled_date`, `placed_at`, `fulfilled_at`, `cancelled_at`, `idempotency_key`, `notes`, `created_at`, `updated_at`

`salesman_id` null when Admin Raises a Bill with no sale. `gatepass_id` set on Book Now (required) and on salesman fulfil; empty on an unfulfilled Pre-order and on Admin fulfil / Raise Bill. Book Now CHECK: `route_id` present. Pre-order CHECK: `route_id` present and `gatepass_id` null until fulfil.

## Not on `orders`

`number` (MB), `letterhead`, `legal_type`, `bill_date`, tax paise totals, IRN / portal cancel. Those are `bills`.
