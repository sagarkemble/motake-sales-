ALTER TYPE "public"."audit_entity_type" ADD VALUE 'city';--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"state" varchar(120) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "city_id" uuid;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cities_state_name_unique" ON "cities" USING btree ("state",lower("name"));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_city_id_idx" ON "customers" USING btree ("city_id");