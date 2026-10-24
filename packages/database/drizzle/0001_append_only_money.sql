-- Ledger and money history are insert-only (ADR-0002). TRUNCATE (cutover wipe) is still allowed.
CREATE OR REPLACE FUNCTION "public"."refuse_append_only_change"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION "public"."refuse_append_only_change"();--> statement-breakpoint
CREATE TRIGGER "payment_events_append_only" BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."refuse_append_only_change"();--> statement-breakpoint
CREATE TRIGGER "refund_events_append_only" BEFORE UPDATE OR DELETE ON "refund_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."refuse_append_only_change"();
