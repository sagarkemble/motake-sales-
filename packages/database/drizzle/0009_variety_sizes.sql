ALTER TYPE "public"."audit_entity_type" ADD VALUE 'unit_of_measure';--> statement-breakpoint
CREATE TABLE "units_of_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(12) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_of_measure_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DROP INDEX "product_varieties_product_name_unique";--> statement-breakpoint
ALTER TABLE "product_varieties" ALTER COLUMN "unit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_varieties" ADD COLUMN "size_value" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "product_varieties" ADD COLUMN "uom_code" varchar(12);--> statement-breakpoint
INSERT INTO "units_of_measure" ("code") VALUES ('ml'), ('L'), ('g'), ('kg');--> statement-breakpoint
-- A trailing "<number> <ml|L|g|kg>" leaves the name and becomes the size. A name that was only a
-- size keeps an empty name, so the Variety still reads "500 g". Names with no size stay as they are.
UPDATE "product_varieties" AS "variety"
SET
	"name" = btrim("split"."parts"[1]),
	"size_value" = "split"."parts"[2]::numeric,
	"uom_code" = CASE lower("split"."parts"[4]) WHEN 'l' THEN 'L' ELSE lower("split"."parts"[4]) END
FROM (
	SELECT "id", regexp_match("name", '^(|.*[^0-9.])\s*([0-9]+(\.[0-9]{1,3})?)\s*(ml|l|g|kg)$', 'i') AS "parts"
	FROM "product_varieties"
) AS "split"
WHERE "split"."id" = "variety"."id" AND "split"."parts" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "product_varieties" ADD COLUMN "display_name" varchar(160) GENERATED ALWAYS AS (CASE WHEN size_value IS NULL THEN name ELSE btrim(name || ' ' || trim_scale(size_value)::text || ' ' || uom_code) END) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "units_of_measure_code_lower_unique" ON "units_of_measure" USING btree (lower("code"));--> statement-breakpoint
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_uom_code_units_of_measure_code_fk" FOREIGN KEY ("uom_code") REFERENCES "public"."units_of_measure"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "product_varieties_product_display_name_unique" ON "product_varieties" USING btree ("product_id","display_name");--> statement-breakpoint
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_size_check" CHECK (("product_varieties"."size_value" IS NULL) = ("product_varieties"."uom_code" IS NULL) AND ("product_varieties"."size_value" IS NULL OR "product_varieties"."size_value" > 0));