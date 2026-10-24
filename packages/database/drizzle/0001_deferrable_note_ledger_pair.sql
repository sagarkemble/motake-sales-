-- notes.ledger_entry_id and ledger_entries.note_id are a 1:1 pair written in one transaction
-- (db-decisions/0001). Defer both FK checks to commit so either row may be inserted first.
ALTER TABLE "notes" ALTER CONSTRAINT "notes_ledger_entry_id_ledger_entries_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER CONSTRAINT "ledger_entries_note_id_notes_id_fk" DEFERRABLE INITIALLY DEFERRED;
