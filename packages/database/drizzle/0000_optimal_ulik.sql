CREATE TYPE "public"."app_role" AS ENUM('admin', 'salesman');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."gatepass_status" AS ENUM('not_issued', 'active', 'pending_verification', 'closed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('confirmed', 'scheduled', 'due', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('book_now', 'pre_order');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(120),
	"phone" varchar(20),
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "salesmen" (
	"id" uuid PRIMARY KEY NOT NULL,
	"salesman_code" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "salesmen_salesman_code_unique" UNIQUE("salesman_code")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"image_key" text,
	"image_url" text,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"unit" varchar(32) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "product_varieties_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_name" varchar(200) NOT NULL,
	"contact_name" varchar(120),
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gatepasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salesman_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" "gatepass_status" DEFAULT 'not_issued' NOT NULL,
	"issued_by" uuid NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"has_discrepancy" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gatepass_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gatepass_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"issued_qty" integer DEFAULT 0 NOT NULL,
	"sold_qty" integer DEFAULT 0 NOT NULL,
	"returned_qty" integer DEFAULT 0 NOT NULL,
	"available_qty" integer GENERATED ALWAYS AS (issued_qty - sold_qty) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gatepass_items_sold_qty_check" CHECK ("gatepass_items"."sold_qty" >= 0),
	CONSTRAINT "gatepass_items_sold_lte_issued_check" CHECK ("gatepass_items"."sold_qty" <= "gatepass_items"."issued_qty"),
	CONSTRAINT "gatepass_items_returned_qty_check" CHECK ("gatepass_items"."returned_qty" >= 0),
	CONSTRAINT "gatepass_items_returned_lte_issued_check" CHECK ("gatepass_items"."returned_qty" <= "gatepass_items"."issued_qty")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_code" varchar(32) NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" NOT NULL,
	"salesman_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"total_quantity" integer NOT NULL,
	"scheduled_date" date,
	"placed_at" timestamp with time zone NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"fulfilled_by" uuid,
	"idempotency_key" varchar(128),
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_order_code_unique" UNIQUE("order_code"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_id_profiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_by_salesmen_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_active_unique" ON "customers" USING btree ("phone") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "gatepasses_salesman_business_date_unique" ON "gatepasses" USING btree ("salesman_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepass_items_gatepass_variety_unique" ON "gatepass_items" USING btree ("gatepass_id","variety_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variety_unique" ON "order_items" USING btree ("order_id","variety_id");