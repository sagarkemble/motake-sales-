ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilled_by_salesmen_id_fk";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_by_profiles_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
