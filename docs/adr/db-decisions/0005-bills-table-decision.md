# Bills store the paper; bill_items store what shipped

`bills` is the current money paper (`docs/adr/db-decisions/0004-order-and-bill-are-separate.md`). `bill_items` are the shipped lines. Correct updates these live rows and appends `bill_versions` (v1 on first issue). Same blob-vs-columns rule as `orders` / `order_items` (0002 / 0003): print stamps in jsonb; FKs, money, GST we SUM/CHECK, dates, unique `MB` number, and IRN stay columns.

## `bills` — blob

| Group | Keys |
| --- | --- |
| Route stamp | `route_name`, `route_code`, `delivery_state` |
| Buyer stamp | `customer_shop_name`, `customer_phone`, `customer_address`, `customer_gstin` |
| Seller stamp | `seller_legal_name`, `seller_address`, `seller_gstin` |

Later seller phone / email / state go in the seller stamp.

## `bills` — columns

**IDs:** `id`, `order_id`, `number`, `legal_type`

**Money:** `total_quantity`, `total_paise`, `taxable_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`, `round_off_paise`

**Dates / ops:** `bill_date`, `created_at`, `updated_at`

**IRN / portal:** `irn`, `irn_ack_number`, `irn_ack_date`, `signed_qr_text`, `signed_qr_image_url`, `irn_recorded_at`, `irn_recorded_by`, `irn_correct_reason`, `portal_cancel_ack_number`, `portal_cancel_ack_date`, `portal_cancel_notes`

`order_id` null on Admin Raise Bill. `number` is `MB/{YY-YY}/{seq}`, unique, assigned when the Bill is created (Book Now place or Pre-order fulfil). IRN pending uses this row (`legal_type = tax_invoice` AND `irn` null AND not cancelled).

## `bill_items` — blob

| Group | Keys |
| --- | --- |
| Variety stamp | `name`, `unit` |
| Tax print | `hsn` |

## `bill_items` — columns

**IDs:** `id`, `bill_id`, `variety_id`, `order_item_id`

**Qty / money:** `quantity`, `route_price_paise`, `taxable_paise`, `cgst_paise`, `sgst_paise`, `igst_paise`

**GST we CHECK:** `exempt`, `gst_rate_bps`

**Ops:** `created_at`, `updated_at`

`order_item_id` is the sale line this shipment came from; null on Admin Raise Bill with no order. CHECKs match `order_items`. Unique `(bill_id, variety_id)`. Live rewrite on Correct; history is `bill_versions.header` + `bill_versions.items` (db-decisions/0006).
