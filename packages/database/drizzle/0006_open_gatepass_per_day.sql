DROP INDEX IF EXISTS "gatepasses_salesman_business_date_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "gatepasses_salesman_active_business_date_unique" ON "gatepasses" USING btree ("salesman_id","business_date") WHERE "gatepasses"."status" = 'active';
