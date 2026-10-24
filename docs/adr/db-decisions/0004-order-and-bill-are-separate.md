# Order is the sale; Bill is the paper

`orders` is the sale or Pre-order. `bills` is the money paper. They are not the same row. This reopens `docs/adr/db-decisions/0001-motake-db-schema.md` (“`orders` = current Bill”) and ADR-0003 / HLD (“billed `orders` row is the Bill”).

**Order** holds who, where, when, status, and what was asked. Status may change (scheduled → due → fulfilled / cancelled). No tax totals, no IRN, no GST amounts, no letterhead, no `MB` number.

**Bill** holds the issued paper: `MB/{YY-YY}/{seq}`, letterhead, tax totals, `legal_type`, `bill_date`, IRN / portal cancel. Live lines are `bill_items` (what shipped). Correct rewrites `bills` + `bill_items` and appends `bill_versions` (v1 on first issue).

Writes:
- Book Now: `orders` + `order_items` and `bills` + `bill_items` + `bill_versions` v1 in one transaction.
- Pre-order place: `orders` + `order_items` only. No Bill, no Ledger, no `MB`.
- Pre-order fulfil / Admin Raise Bill: insert `bills` + `bill_items` + v1. Admin Raise Bill may have `bills.order_id` null.
- Bill Correct: update live `bills` / `bill_items`; append `bill_versions` (header + items snapshots, db-decisions/0006). Notes join `bill_version_id` + `snapshot_line_id`.
- Order place / status change: append `order_versions` (header + items snapshots, db-decisions/0007).

Place-time Route price (and Pre-order tax classification to reuse at fulfil) stay on `order_items` as sale terms. Billed GST amounts and IRN live only on `bills` / `bill_items`.

Ledger Bill debit, Notes, and IRN pending point at `bills`, not `orders`.
