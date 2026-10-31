# No e-invoicing in the app

Motake does not do e-invoicing inside the app. A Tax Invoice no longer waits for an IRN. Its PDF is drawn when the Bill is issued, and its WhatsApp goes out straight away, for every Customer.

These are removed:

- Enter IRN and Correct IRN, with the signed QR text and image.
- The IRN pending list and its count.
- Record portal cancellation.
- The Portal JSON and Draft PDF downloads.
- The IRN block and QR on the Tax Invoice PDF.
- The Customer "E-invoicing required" switch.

GSTR-1 filing and the Filed-month lock stay as they were. A Bill dated in a filed month still refuses line Correct and Cancel, and points the Admin to Raise Note instead.

The database keeps its columns and has no migration. These stay unused:

- `customers.einvoicing_required`: new Customers write `false`.
- `seller_settings.einvoicing_required`: stays at its default.
- `bills.irn*`, `signed_qr_*` and `portal_cancel_*`: never written.

The API stops reading and returning all of them. Old audit actions for IRN stay in the enum.

This replaces the e-invoicing parts of ADR-0002, the IRN and portal-cancel columns in `db-decisions/0001`, `0004` and `0005`, and the "manual IRN" edge in `docs/hld.md`. Those documents are left as they were written.

We rejected hiding e-invoicing behind a setting. Nobody would maintain a flow that is turned off, and every Bill, PDF and message path would still have to branch on it.
