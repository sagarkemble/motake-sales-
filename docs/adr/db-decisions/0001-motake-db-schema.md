# Motake Postgres schema follows the closed #21–#33 specs, not the live app tables

The live Drizzle models still match the old company-wide price app (numeric rupees, unique phone, no Route, no Ledger). Closed map [#20](https://github.com/Lunar-Studio-Dev/motake-sales/issues/20) now specifies what Motake must store. **Cutover wipes those live money/order rows (#25) and ships this schema.** **Amended by `docs/adr/db-decisions/0004-order-and-bill-are-separate.md`:** `orders` is the sale; `bills` is the paper. Money is bigint paise. `customers.balance_paise` is a maintained copy of Ledger Debits − Credits, not a second source of truth.

We keep **controlled snapshots** (Route on the Bill, seller on Bill/Note, line prices and tax) so later Settings edits do not rewrite documents. We do **not** stamp `filed` on every Bill — month lock is derived from `gstr1_filings` + Bill date. Document prefixes and the GST Credit Note deadline live per financial year, not on each document. Notification tables stay a transport store (ADR-0001); domain never rolls back when WhatsApp fails.

The live ER is the canvas `motake-db-er-diagram.canvas.tsx` (proposed mode). This ADR freezes that shape. HLD selling ER is unchanged; this ADR fills the money/settings/IRN/notification DDL the HLD left for a later spec.

## Completeness vs closed specs

| Need | Store |
| --- | --- |
| Route, prices, tax periods, GatePass Route | `routes`, `route_prices`, `variety_tax_periods`, `gatepasses.route_id` |
| Customer on one Route, GSTIN, IRN flag, Balance copy | `customers` |
| Bill number when the paper is issued | `bills.number` (Book Now place or Pre-order fulfil) |
| Pre-order place vs fulfil | `type`, `status`, `scheduled_date`, nullable `bill_date` / `gatepass_id` |
| Admin Raise Bill (no salesman / GatePass) | nullable `salesman_id`; Book Now CHECK is `route_id` only |
| Bill history + Notes + remaining qty | `bill_versions` (header + items jsonb), `notes`, `note_lines` |
| Order history | `order_versions` (header + items jsonb) |
| Ledger, Payment MP, Refund MR, Opening | `ledger_entries`, `payments`, `payment_events`, `refunds`, `refund_events` |
| IRN / QR / portal cancel | columns on `bills` |
| Seller master + prefix freeze + CN deadline + GSTR-1 | `seller_settings`, `document_number_series`, `gst_credit_note_deadlines`, `gstr1_filings` |
| WhatsApp kinds / skip / attachment URL | `notifications`, `notification_attempts` (`account_update`, `cancellation`; db-decisions/0013) |
| Who did which procedure | `audit_logs` (`audit_entity_type`, `audit_action`; db-decisions/0012) |

**Intentionally not stored:** PDF bytes, Meta template IDs, a `filed` flag on Bills, a dated Route price list, company-wide `unit_price`, unique Customer phone.

## Normalization

3NF for masters and events. Allowed denorm:

- `orders` = sale; `bills` = current paper (full line rewrite + `bill_versions` copy). See db-decisions/0004.
- `customers.balance_paise` copy, rebuilt from Ledger.
- Frozen Route / seller / buyer / line tax on documents so Settings or Customer edits do not rewrite papers.
- `next_seq` on the series row (concurrency), not computed from `MAX(number)`.

Split that stays 3NF: prefixes vs GST CN deadline vs GSTR-1 month (three tables, not five prefix columns on one FY row). Note lines point at `bill_versions` + `items[].id`; remaining uncredited qty is derived.

`notes.ledger_entry_id` and `ledger_entries.note_id` are a 1:1 pair written in one transaction (deferrable FKs or insert-then-backfill).

## Contradictions left as already closed

- ADR-0002 numbered MB/MC/MD only. Closed #33 adds MP/MR on the same series table. This freeze follows #33.
- ADR-0003 said Pre-order `salesman_id` is who placed it. Admin Raise Bill has none; that column is nullable here.

**Not in this freeze:** RLS, extra OpenAPI field lists, PDF binary storage, Meta template IDs, Drizzle/migrations (implement later).
