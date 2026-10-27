ALTER TABLE "bills" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_idempotency_key_unique" UNIQUE("idempotency_key");