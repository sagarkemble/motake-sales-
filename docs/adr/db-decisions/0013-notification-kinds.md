# WhatsApp kinds include account_update and cancellation; no FK to domain rows

`notification_kind` is `bill`, `receipt`, `credit_note`, `debit_note`, `account_update`, `cancellation`. Lookup status by `business_ref` (indexed, opaque, no FK). Commercial Credit Note, Payment adjustment, Refund, and a Balance-changing Bill edit enqueue `account_update`. Bill cancel enqueues `cancellation`, not `account_update`. A GSTIN GST Note also enqueues `credit_note` / `debit_note`. Receipt, account update, and cancellation have no PDF.
