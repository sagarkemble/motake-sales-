# Order history is one order_versions row: header snapshot + items snapshot

Same pattern as `bill_versions` (`docs/adr/db-decisions/0006-bill-versions-embed-snapshots.md`). Live `orders` / `order_items` stay current. Every place or later change (status, GatePass on fulfil, cancel, line rewrite) appends `order_versions`. v1 is written when the order is placed.

**Columns:** `id`, `order_id`, `version_number`, `reason`, `actor_id`, `created_at`

**Blobs**
- `header` — full `orders` snapshot (type, status, salesman, customer, route, gatepass, dates)
- `items` — array of full `order_items` snapshots, each keeping that line’s `id`

No `order_version_lines` table. Unique `(order_id, version_number)`.
