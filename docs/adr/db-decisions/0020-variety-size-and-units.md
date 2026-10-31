# A Variety is a name plus a size in a managed unit

Admin asked for each Variety to be a name plus a size, like "Toned Milk" 500 ml, instead of a name with the size typed in and a pack word ("pouch", "cup"). The unit comes from a list kept in a table. It starts with ml, L, g and kg, and Admin can add more.

Migration `0009_variety_sizes` adds:

- **`units_of_measure`:** `id`, `code` varchar(12), nullable `created_by` → profiles, and timestamps.
  - `code` is unique, and also unique on `lower(code)`, so "ML" cannot sit beside "ml".
  - The migration seeds ml, L, g and kg with a null `created_by`.
  - Units are never edited or deleted, so there is no `deleted_at`.
  - Each add gets an audit row, with the new `audit_entity_type` value `unit_of_measure`.
- **`product_varieties.size_value`:** numeric(10,3), like 500 or 1.5.
- **`product_varieties.uom_code`:** a FK to `units_of_measure.code` (`onDelete restrict`).
  - A Variety points at the unit by code. Units are never renamed, so the code is stable.
  - Pointing by code also lets the generated column below print the unit without a join.
- **A check on the size:** `size_value` and `uom_code` are both set or both null, and the size is above 0.
  - Both are null only on a Variety from before sizes whose name had no size to split off.
  - The Variety form asks for a size on every add and edit, so such a Variety gets one at its next edit.
- **`product_varieties.display_name`:** a stored generated column, `name size uom` trimmed, or just `name` while there is no size.
  - Every screen reads and prints this.
  - New order and Bill lines stamp it as the line name.
  - `trim_scale` drops trailing zeros, so 500.000 prints as 500.
- **The name unique index:** it moves from `(product_id, name)` to `(product_id, display_name)`.
  - "Toned Milk" 500 ml and "Toned Milk" 1 L are two Varieties of one Product.
- **`product_varieties.unit`:** the old pack word becomes nullable and is no longer written or read.
  - It is kept so the old values are not destroyed.
  - New stamps carry an empty unit, and screens and PDFs hide an empty unit.

The migration splits a trailing `<number> <ml|L|g|kg>` off each existing name into the size and unit. A name that was only a size ("500 g") keeps an empty name, so it still reads "500 g". Using the Product name instead would read "Basundi Basundi 500 g" on screens that show the Product too.

Order and Bill lines already issued keep their stamps, `{name, unit, hsn}`. They print exactly as before, pack word included.

**Considered:**

- A free-text unit next to the size. Spellings would drift ("ml", "ML", "mL"), and the user wanted a managed list.
- Pointing at the unit by `id`. The generated column would then need a join, and a generated column cannot read another table.
- Keeping the pack word as a third field. The user chose name and size only.
