# Payment Correct uses payment_events; 0008 insert-only is withdrawn

Reopen `docs/adr/db-decisions/0008-payments-are-insert-only.md`. Admin may Correct a recorded Payment (kept amount, mode, reference) with a reason. Same pattern as Refunds (option B).

`payments` is the current row (`MP/{YY-YY}/{seq}`). `payment_events` is append-only history (`posted` then `adjusted`). Amount change writes a Ledger **Payment adjusted** row linked to that Payment. Mode/ref-only Correct writes an event with `ledger_entry_id` null. Correct may take kept to ₹0; that is not a delete. More money from the shop is still a new Payment.

This matches ADR-0002 and CONTEXT Payment adjustment.
