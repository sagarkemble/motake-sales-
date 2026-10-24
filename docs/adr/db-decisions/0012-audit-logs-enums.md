# audit_logs uses Motake enums; it is not a second Bill History

Replace varchar `entity_type` / `action` with `audit_entity_type` and `audit_action`. Add nullable `reason` and `customer_id`. Payload is changed fields only.

Do not copy `bill_versions`, `order_versions`, `payment_events`, `refund_events`, Ledger, or WhatsApp into this table. IRN Correct, seller master, GST Credit Note deadline, GSTR-1, GatePass, and Customer move have no other history — they live here.
