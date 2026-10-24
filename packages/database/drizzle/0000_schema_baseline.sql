CREATE TYPE "public"."app_role" AS ENUM('admin', 'salesman');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('created', 'updated', 'activated', 'deactivated', 'deleted', 'allotted', 'handover_submitted', 'closed', 'placed', 'fulfilled', 'cancelled', 'corrected', 'irn_recorded', 'portal_cancelled', 'note_raised', 'opening_set', 'filed', 'moved_route');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('profile', 'salesman', 'product', 'product_variety', 'variety_tax_period', 'route', 'route_price', 'customer', 'gatepass', 'order', 'bill', 'note', 'payment', 'refund', 'seller_settings', 'document_number_series', 'gst_credit_note_deadline', 'gstr1_filing');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('bill', 'credit_note', 'debit_note', 'payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."gatepass_short_reason" AS ENUM('damaged', 'expired', 'lost', 'leaked', 'other');--> statement-breakpoint
CREATE TYPE "public"."gatepass_status" AS ENUM('not_issued', 'active', 'pending_verification', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('opening_balance', 'bill', 'payment', 'credit_note', 'debit_note', 'payment_adjusted', 'refund', 'refund_adjusted');--> statement-breakpoint
CREATE TYPE "public"."ledger_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."legal_type" AS ENUM('tax_invoice', 'bill_of_supply');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('gst_credit_note', 'commercial_credit_note', 'debit_note');--> statement-breakpoint
CREATE TYPE "public"."notification_attempt_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('bill', 'receipt', 'credit_note', 'debit_note', 'account_update', 'cancellation');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('confirmed', 'scheduled', 'due', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('book_now', 'pre_order');--> statement-breakpoint
CREATE TYPE "public"."payment_event_kind" AS ENUM('posted', 'adjusted');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'bank', 'upi');--> statement-breakpoint
CREATE TYPE "public"."refund_event_kind" AS ENUM('posted', 'adjusted');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role" "app_role" NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(120),
	"phone" varchar(20),
	"avatar_key" text,
	"avatar_url" text,
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
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"customer_id" uuid,
	"reason" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "variety_tax_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variety_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"hsn" varchar(8) NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variety_tax_periods_hsn_check" CHECK ("variety_tax_periods"."hsn" ~ '^[0-9]{4,8}$'),
	CONSTRAINT "variety_tax_periods_exempt_rate_check" CHECK (("variety_tax_periods"."exempt" AND "variety_tax_periods"."gst_rate_bps" = 0) OR (NOT "variety_tax_periods"."exempt" AND "variety_tax_periods"."gst_rate_bps" > 0))
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(64) NOT NULL,
	"delivery_state" varchar(120) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"price_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "route_prices_price_paise_check" CHECK ("route_prices"."price_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "gatepasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salesman_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"status" "gatepass_status" DEFAULT 'not_issued' NOT NULL,
	"issued_by" uuid NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"has_discrepancy" boolean DEFAULT false NOT NULL,
	"discrepancy_reason" text,
	"handover_submitted_at" timestamp with time zone,
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
	"short_reason" "gatepass_short_reason",
	"short_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gatepass_items_sold_qty_check" CHECK ("gatepass_items"."sold_qty" >= 0),
	CONSTRAINT "gatepass_items_sold_lte_issued_check" CHECK ("gatepass_items"."sold_qty" <= "gatepass_items"."issued_qty"),
	CONSTRAINT "gatepass_items_returned_qty_check" CHECK ("gatepass_items"."returned_qty" >= 0),
	CONSTRAINT "gatepass_items_returned_lte_issued_check" CHECK ("gatepass_items"."returned_qty" <= "gatepass_items"."issued_qty")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_name" varchar(200) NOT NULL,
	"contact_name" varchar(120),
	"phone" varchar(20) NOT NULL,
	"address" text NOT NULL,
	"notes" text,
	"shop_photo_key" text,
	"shop_photo_url" text,
	"route_id" uuid NOT NULL,
	"gstin" varchar(15),
	"einvoicing_required" boolean NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" NOT NULL,
	"salesman_id" uuid,
	"customer_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"gatepass_id" uuid,
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
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_book_now_check" CHECK ("orders"."type" <> 'book_now' OR "orders"."route_id" IS NOT NULL),
	CONSTRAINT "orders_pre_order_check" CHECK ("orders"."type" <> 'pre_order' OR "orders"."route_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"stamp" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"route_price_paise" bigint NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_route_price_paise_check" CHECK ("order_items"."route_price_paise" > 0),
	CONSTRAINT "order_items_exempt_rate_check" CHECK (("order_items"."exempt" AND "order_items"."gst_rate_bps" = 0) OR (NOT "order_items"."exempt" AND "order_items"."gst_rate_bps" > 0))
);
--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"order_item_id" uuid,
	"stamp" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"route_price_paise" bigint NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bill_items_quantity_check" CHECK ("bill_items"."quantity" > 0),
	CONSTRAINT "bill_items_route_price_paise_check" CHECK ("bill_items"."route_price_paise" > 0),
	CONSTRAINT "bill_items_exempt_rate_check" CHECK (("bill_items"."exempt" AND "bill_items"."gst_rate_bps" = 0) OR (NOT "bill_items"."exempt" AND "bill_items"."gst_rate_bps" > 0))
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"number" varchar(16) NOT NULL,
	"legal_type" "legal_type" NOT NULL,
	"letterhead" jsonb NOT NULL,
	"total_quantity" integer NOT NULL,
	"total_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"round_off_paise" bigint NOT NULL,
	"bill_date" date NOT NULL,
	"irn" text,
	"irn_ack_number" varchar(64),
	"irn_ack_date" date,
	"signed_qr_text" text,
	"signed_qr_image_url" text,
	"irn_recorded_at" timestamp with time zone,
	"irn_recorded_by" uuid,
	"irn_correct_reason" text,
	"portal_cancel_ack_number" varchar(64),
	"portal_cancel_ack_date" date,
	"portal_cancel_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bills_irn_unique" UNIQUE("irn"),
	CONSTRAINT "bills_total_paise_check" CHECK ("bills"."total_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"header" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"header" jsonb NOT NULL,
	"items" jsonb NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"side" "ledger_side" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"gatepass_id" uuid,
	"bill_id" uuid,
	"note_id" uuid,
	"payment_id" uuid,
	"refund_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_paise_check" CHECK ("ledger_entries"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"bill_version_id" uuid NOT NULL,
	"snapshot_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "note_kind" NOT NULL,
	"number" varchar(16) NOT NULL,
	"bill_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"return_or_damage_on" date,
	"amount_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"seller_legal_name" varchar(200) NOT NULL,
	"seller_address" text NOT NULL,
	"seller_gstin" varchar(15) NOT NULL,
	"pdf_url" text,
	"ledger_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_ledger_entry_id_unique" UNIQUE("ledger_entry_id")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"kind" "payment_event_kind" NOT NULL,
	"amount_kept_paise" bigint NOT NULL,
	"previous_kept_paise" bigint NOT NULL,
	"difference_paise" bigint NOT NULL,
	"reason" text,
	"mode" "payment_mode" NOT NULL,
	"reference" varchar(128),
	"correction_date" date,
	"actor_id" uuid NOT NULL,
	"ledger_entry_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"amount_received_paise" bigint NOT NULL,
	"amount_kept_paise" bigint NOT NULL,
	"amount_returned_paise" bigint NOT NULL,
	"number" varchar(16) NOT NULL,
	"reference" varchar(128),
	"gatepass_id" uuid,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_cash_split_check" CHECK ("payments"."mode" <> 'cash' OR "payments"."amount_received_paise" = "payments"."amount_kept_paise" + "payments"."amount_returned_paise"),
	CONSTRAINT "payments_kept_non_negative_check" CHECK ("payments"."amount_kept_paise" >= 0 AND "payments"."amount_returned_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refund_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"kind" "refund_event_kind" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"previous_amount_paise" bigint NOT NULL,
	"difference_paise" bigint NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reference" varchar(128),
	"reason" text,
	"correction_date" date,
	"actor_id" uuid NOT NULL,
	"ledger_entry_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"number" varchar(16) NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"reference" varchar(128),
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_paise_check" CHECK ("refunds"."amount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "document_number_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_year" varchar(5) NOT NULL,
	"kind" "document_kind" NOT NULL,
	"prefix" varchar(2) NOT NULL,
	"next_seq" integer NOT NULL,
	"first_used_at" timestamp with time zone,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gst_credit_note_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_year" varchar(5) NOT NULL,
	"deadline_date" date NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gstr1_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_month" date NOT NULL,
	"filed_on" date NOT NULL,
	"reference" varchar(128) NOT NULL,
	"filer_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"address" text NOT NULL,
	"state" varchar(120) NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255),
	"einvoicing_required" boolean DEFAULT true NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "notification_attempt_status" NOT NULL,
	"provider" varchar(40),
	"provider_message_id" varchar(128),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"business_ref" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"recipient_phone" varchar(20),
	"body_text" text NOT NULL,
	"attachment_url" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "salesmen" ADD CONSTRAINT "salesmen_id_profiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_varieties" ADD CONSTRAINT "product_varieties_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety_tax_periods" ADD CONSTRAINT "variety_tax_periods_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_prices" ADD CONSTRAINT "route_prices_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_prices" ADD CONSTRAINT "route_prices_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_by_profiles_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_irn_recorded_by_profiles_id_fk" FOREIGN KEY ("irn_recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_versions" ADD CONSTRAINT "order_versions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_versions" ADD CONSTRAINT "order_versions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_bill_version_id_bill_versions_id_fk" FOREIGN KEY ("bill_version_id") REFERENCES "public"."bill_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_number_series" ADD CONSTRAINT "document_number_series_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gst_credit_note_deadlines" ADD CONSTRAINT "gst_credit_note_deadlines_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr1_filings" ADD CONSTRAINT "gstr1_filings_filer_id_profiles_id_fk" FOREIGN KEY ("filer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_settings" ADD CONSTRAINT "seller_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_customer_idx" ON "audit_logs" USING btree ("customer_id","created_at") WHERE "audit_logs"."customer_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_varieties_product_name_unique" ON "product_varieties" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "variety_tax_periods_variety_from_unique" ON "variety_tax_periods" USING btree ("variety_id","effective_from");--> statement-breakpoint
CREATE INDEX "variety_tax_periods_lookup_idx" ON "variety_tax_periods" USING btree ("variety_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "routes_name_unique" ON "routes" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "routes_code_unique" ON "routes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "route_prices_route_variety_unique" ON "route_prices" USING btree ("route_id","variety_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepasses_salesman_active_business_date_unique" ON "gatepasses" USING btree ("salesman_id","business_date") WHERE "gatepasses"."status" = 'active';--> statement-breakpoint
CREATE INDEX "gatepasses_route_id_idx" ON "gatepasses" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepass_items_gatepass_variety_unique" ON "gatepass_items" USING btree ("gatepass_id","variety_id");--> statement-breakpoint
CREATE INDEX "customers_route_id_idx" ON "customers" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "orders_route_id_idx" ON "orders" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "orders_gatepass_id_idx" ON "orders" USING btree ("gatepass_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variety_unique" ON "order_items" USING btree ("order_id","variety_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_items_bill_variety_unique" ON "bill_items" USING btree ("bill_id","variety_id");--> statement-breakpoint
CREATE INDEX "bills_order_id_idx" ON "bills" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_order_id_unique" ON "bills" USING btree ("order_id") WHERE "bills"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_number_unique" ON "bills" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_versions_bill_version_unique" ON "bill_versions" USING btree ("bill_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "order_versions_order_version_unique" ON "order_versions" USING btree ("order_id","version_number");--> statement-breakpoint
CREATE INDEX "ledger_entries_customer_occurred_idx" ON "ledger_entries" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_opening_balance_unique" ON "ledger_entries" USING btree ("customer_id") WHERE "ledger_entries"."entry_type" = 'opening_balance';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_bill_unique" ON "ledger_entries" USING btree ("bill_id") WHERE "ledger_entries"."entry_type" = 'bill';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_note_unique" ON "ledger_entries" USING btree ("note_id") WHERE "ledger_entries"."note_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "note_lines_note_id_idx" ON "note_lines" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_lines_bill_version_line_idx" ON "note_lines" USING btree ("bill_version_id","snapshot_line_id");--> statement-breakpoint
CREATE INDEX "notes_bill_id_idx" ON "notes" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_number_unique" ON "notes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "payment_events_payment_occurred_idx" ON "payment_events" USING btree ("payment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "payments_customer_occurred_idx" ON "payments" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_unique" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_number_unique" ON "payments" USING btree ("number");--> statement-breakpoint
CREATE INDEX "refund_events_refund_occurred_idx" ON "refund_events" USING btree ("refund_id","occurred_at");--> statement-breakpoint
CREATE INDEX "refunds_customer_occurred_idx" ON "refunds" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_number_unique" ON "refunds" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_key_unique" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "document_number_series_fy_kind_unique" ON "document_number_series" USING btree ("financial_year","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "gst_credit_note_deadlines_fy_unique" ON "gst_credit_note_deadlines" USING btree ("financial_year");--> statement-breakpoint
CREATE UNIQUE INDEX "gstr1_filings_period_month_unique" ON "gstr1_filings" USING btree ("period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_unique" ON "notification_attempts" USING btree ("notification_id","attempt_number");--> statement-breakpoint
CREATE INDEX "notifications_business_ref_idx" ON "notifications" USING btree ("business_ref");