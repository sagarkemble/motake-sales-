# A Payment is insert-only; more money is a new Payment plus Ledger credit

**Withdrawn** by `docs/adr/db-decisions/0011-restore-payment-events.md`. Do not follow this file.

Drop `payment_events`. Do not Correct or rewrite a recorded Payment. Motake only records money that already happened outside the app. If the shop pays again, insert a new `payments` row and a new Ledger Payment credit. One Ledger row per Payment (`ledger_entries.payment_id`).

There is no Payment status and no Payment-adjusted Ledger type. The recorded row is the fact. History of money in is the list of Payment rows, not versions of one row.

This reopens ADR-0002 and CONTEXT (“Admin may Correct kept amount”; Payment adjustment). A wrongly high record is not fixed by editing that Payment; extra cash from the shop is a new Payment. Refunds / `refund_events` are not decided here.
