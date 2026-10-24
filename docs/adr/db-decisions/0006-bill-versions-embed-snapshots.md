# Bill history is one bill_versions row: header snapshot + items snapshot

Drop `bill_version_lines`. Each `bill_versions` row is one frozen paper: the `bills` row at that moment and every `bill_items` row at that moment. v1 is written when the Bill is issued. Correct rewrites live `bills` / `bill_items` and appends a new version. Later versions do not rewrite earlier ones.

**Columns** (identity / who / why): `id`, `bill_id`, `version_number`, `reason` (v1 = Raised), `actor_id`, `pdf_url`, `created_at`

**Blobs**
- `header` — full `bills` snapshot (number, letterhead, legal_type, tax totals, bill_date, IRN / portal fields, order_id)
- `items` — array of full `bill_items` snapshots. Each element keeps that line’s `id` so Notes can point at it

Same blob-vs-columns rule as 0005: print stamps stay nested inside those snapshots the way they live on the live row (`letterhead`, line `stamp`). Do not flatten them again on `bill_versions`.

`note_lines` points at `bill_version_id` + `snapshot_line_id` (`items[].id`). Remaining uncredited qty is derived: that line’s snapshotted `quantity` minus `SUM(note_lines.quantity)` for the same pair. No SQL FK to a line table.

Unique `(bill_id, version_number)`.
