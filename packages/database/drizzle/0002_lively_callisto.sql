ALTER TABLE "product_varieties" ADD COLUMN "unit_price" numeric(12, 2);--> statement-breakpoint
UPDATE "product_varieties" SET "unit_price" = 0 WHERE "unit_price" IS NULL;--> statement-breakpoint
ALTER TABLE "product_varieties" ALTER COLUMN "unit_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_amount" numeric(12, 2);--> statement-breakpoint
UPDATE "orders" SET "total_amount" = 0 WHERE "total_amount" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_price" numeric(12, 2);--> statement-breakpoint
UPDATE "order_items" SET "unit_price" = 0 WHERE "unit_price" IS NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_unit_price_check" CHECK ("product_varieties"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_amount_check" CHECK ("orders"."total_amount" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_check" CHECK ("order_items"."unit_price" >= 0);
