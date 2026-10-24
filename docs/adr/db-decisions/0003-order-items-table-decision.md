# Order items store what was asked; billed GST amounts live on bill_items

`order_items` are sale lines (`docs/adr/db-decisions/0004-order-and-bill-are-separate.md`). Variety print stamps travel together in jsonb. Qty, live FK, and locked Route price stay columns.

Billed tax amounts, IRN, and letterhead are not here. They live on `bill_items` / `bills` (`docs/adr/db-decisions/0005-bills-table-decision.md`). Pre-order still locks Route price and tax classification at place so fulfil does not re-price or re-tax; that lock is sale terms on this row (`exempt`, `gst_rate_bps`, HSN in the stamp). Amounts are computed when the Bill is issued.

## Blob — frozen stamp

| Group | Keys |
| --- | --- |
| Variety stamp | `name`, `unit` |
| Tax lock (print) | `hsn` |

Later Variety SKU as a print field goes in the Variety stamp.

## Columns

**IDs:** `id`, `order_id`, `variety_id`

**Qty / price:** `quantity`, `route_price_paise`

**Tax classification lock:** `exempt`, `gst_rate_bps`

**Ops:** `created_at`

CHECKs: `quantity > 0`, `route_price_paise > 0`, `(exempt AND gst_rate_bps = 0) OR (NOT exempt AND gst_rate_bps > 0)`. Unique `(order_id, variety_id)`.
