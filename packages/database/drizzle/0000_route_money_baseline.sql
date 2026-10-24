CREATE TYPE "public"."app_role" AS ENUM('admin', 'salesman');--> statement-breakpoint
CREATE TYPE "public"."document_series" AS ENUM('bill', 'credit_note', 'debit_note', 'payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."gatepass_short_reason" AS ENUM('damaged', 'expired', 'lost', 'leaked', 'other');--> statement-breakpoint
CREATE TYPE "public"."gatepass_status" AS ENUM('not_issued', 'active', 'pending_verification', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('opening_balance', 'bill', 'payment', 'credit_note', 'debit_note', 'payment_adjusted', 'refund', 'refund_adjusted');--> statement-breakpoint
CREATE TYPE "public"."ledger_side" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."legal_type" AS ENUM('tax_invoice', 'bill_of_supply');--> statement-breakpoint
CREATE TYPE "public"."money_event_type" AS ENUM('posted', 'adjusted');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('gst_credit_note', 'commercial_credit_note', 'debit_note');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('text', 'template', 'document');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'delivered', 'read', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('confirmed', 'scheduled', 'due', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('book_now', 'pre_order', 'office_bill');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('cash', 'bank', 'upi');--> statement-breakpoint
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
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(64) NOT NULL,
	"delivery_state" varchar(64) NOT NULL,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "routes_code_unique" UNIQUE("code")
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
CREATE TABLE "variety_tax_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variety_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"hsn" varchar(8) NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variety_tax_periods_hsn_check" CHECK ("variety_tax_periods"."hsn" ~ '^[0-9]{4,8}$'),
	CONSTRAINT "variety_tax_periods_rate_check" CHECK (("variety_tax_periods"."exempt" AND "variety_tax_periods"."gst_rate_bps" = 0) OR (NOT "variety_tax_periods"."exempt" AND "variety_tax_periods"."gst_rate_bps" > 0))
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
	"deleted_at" timestamp with time zone,
	CONSTRAINT "customers_gstin_check" CHECK ("customers"."gstin" IS NULL OR char_length("customers"."gstin") = 15)
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
	"available_qty" integer GENERATED ALWAYS AS (issued_qty - sold_qty) STORED,
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
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_number" varchar(16) NOT NULL,
	"type" "order_type" NOT NULL,
	"status" "order_status" NOT NULL,
	"salesman_id" uuid,
	"customer_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"gatepass_id" uuid,
	"route_name" varchar(120) NOT NULL,
	"route_code" varchar(64) NOT NULL,
	"delivery_state" varchar(64) NOT NULL,
	"seller_snapshot" jsonb NOT NULL,
	"legal_type" "legal_type" NOT NULL,
	"total_quantity" integer NOT NULL,
	"total_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"round_off_paise" bigint NOT NULL,
	"scheduled_date" date,
	"placed_at" timestamp with time zone NOT NULL,
	"bill_date" date,
	"fulfilled_at" timestamp with time zone,
	"fulfilled_by" uuid,
	"idempotency_key" varchar(128),
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"irn" varchar(64),
	"irn_ack_number" varchar(64),
	"irn_ack_date" timestamp with time zone,
	"irn_signed_qr" text,
	"irn_qr_image_key" text,
	"irn_recorded_by" uuid,
	"irn_recorded_at" timestamp with time zone,
	"irn_corrected_by" uuid,
	"irn_corrected_at" timestamp with time zone,
	"irn_correction_reason" text,
	"portal_cancel_ack_number" varchar(64),
	"portal_cancel_date" date,
	"portal_cancel_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_bill_number_unique" UNIQUE("bill_number"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_irn_unique" UNIQUE("irn"),
	CONSTRAINT "orders_type_links_check" CHECK (("orders"."type" = 'book_now' AND "orders"."gatepass_id" IS NOT NULL AND "orders"."salesman_id" IS NOT NULL)
        OR ("orders"."type" = 'pre_order' AND "orders"."gatepass_id" IS NULL AND "orders"."salesman_id" IS NOT NULL)
        OR ("orders"."type" = 'office_bill' AND "orders"."gatepass_id" IS NULL AND "orders"."salesman_id" IS NULL)),
	CONSTRAINT "orders_money_check" CHECK ("orders"."total_paise" >= 0 AND "orders"."taxable_paise" >= 0 AND "orders"."cgst_paise" >= 0
        AND "orders"."sgst_paise" >= 0 AND "orders"."igst_paise" >= 0),
	CONSTRAINT "orders_total_quantity_check" CHECK ("orders"."total_quantity" > 0),
	CONSTRAINT "orders_irn_fields_check" CHECK ("orders"."irn" IS NULL OR ("orders"."irn_ack_number" IS NOT NULL AND "orders"."irn_ack_date" IS NOT NULL
        AND "orders"."irn_signed_qr" IS NOT NULL)),
	CONSTRAINT "orders_irn_tax_invoice_check" CHECK ("orders"."irn" IS NULL OR "orders"."legal_type" = 'tax_invoice')
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"variety_name" varchar(120) NOT NULL,
	"unit" varchar(32) NOT NULL,
	"quantity" integer NOT NULL,
	"route_price_paise" bigint NOT NULL,
	"hsn" varchar(8) NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_route_price_paise_check" CHECK ("order_items"."route_price_paise" > 0),
	CONSTRAINT "order_items_hsn_check" CHECK ("order_items"."hsn" ~ '^[0-9]{4,8}$'),
	CONSTRAINT "order_items_rate_check" CHECK (("order_items"."exempt" AND "order_items"."gst_rate_bps" = 0) OR (NOT "order_items"."exempt" AND "order_items"."gst_rate_bps" > 0)),
	CONSTRAINT "order_items_money_check" CHECK ("order_items"."taxable_paise" >= 0 AND "order_items"."cgst_paise" >= 0 AND "order_items"."sgst_paise" >= 0
        AND "order_items"."igst_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bill_version_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_version_id" uuid NOT NULL,
	"variety_id" uuid NOT NULL,
	"variety_name" varchar(120) NOT NULL,
	"unit" varchar(32) NOT NULL,
	"quantity" integer NOT NULL,
	"route_price_paise" bigint NOT NULL,
	"hsn" varchar(8) NOT NULL,
	"exempt" boolean NOT NULL,
	"gst_rate_bps" integer NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	CONSTRAINT "bill_version_lines_quantity_check" CHECK ("bill_version_lines"."quantity" > 0),
	CONSTRAINT "bill_version_lines_route_price_paise_check" CHECK ("bill_version_lines"."route_price_paise" > 0),
	CONSTRAINT "bill_version_lines_hsn_check" CHECK ("bill_version_lines"."hsn" ~ '^[0-9]{4,8}$'),
	CONSTRAINT "bill_version_lines_rate_check" CHECK (("bill_version_lines"."exempt" AND "bill_version_lines"."gst_rate_bps" = 0) OR (NOT "bill_version_lines"."exempt" AND "bill_version_lines"."gst_rate_bps" > 0)),
	CONSTRAINT "bill_version_lines_money_check" CHECK ("bill_version_lines"."taxable_paise" >= 0 AND "bill_version_lines"."cgst_paise" >= 0 AND "bill_version_lines"."sgst_paise" >= 0
        AND "bill_version_lines"."igst_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"total_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"round_off_paise" bigint NOT NULL,
	"legal_type" "legal_type" NOT NULL,
	"place_of_supply_state" varchar(64) NOT NULL,
	"notes" text,
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_versions_version_number_check" CHECK ("bill_versions"."version_number" >= 1),
	CONSTRAINT "bill_versions_money_check" CHECK ("bill_versions"."total_paise" >= 0 AND "bill_versions"."taxable_paise" >= 0 AND "bill_versions"."cgst_paise" >= 0
        AND "bill_versions"."sgst_paise" >= 0 AND "bill_versions"."igst_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"bill_version_line_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount_paise" bigint NOT NULL,
	"taxable_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	CONSTRAINT "note_lines_quantity_check" CHECK ("note_lines"."quantity" > 0),
	CONSTRAINT "note_lines_money_check" CHECK ("note_lines"."amount_paise" >= 0 AND "note_lines"."taxable_paise" >= 0 AND "note_lines"."cgst_paise" >= 0
        AND "note_lines"."sgst_paise" >= 0 AND "note_lines"."igst_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "note_kind" NOT NULL,
	"number" varchar(16) NOT NULL,
	"order_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"reason" text NOT NULL,
	"return_or_damage_on" date,
	"amount_paise" bigint NOT NULL,
	"cgst_paise" bigint NOT NULL,
	"sgst_paise" bigint NOT NULL,
	"igst_paise" bigint NOT NULL,
	"seller_snapshot" jsonb NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_number_unique" UNIQUE("number"),
	CONSTRAINT "notes_amount_paise_check" CHECK ("notes"."amount_paise" > 0),
	CONSTRAINT "notes_tax_check" CHECK ("notes"."cgst_paise" >= 0 AND "notes"."sgst_paise" >= 0 AND "notes"."igst_paise" >= 0),
	CONSTRAINT "notes_commercial_no_tax_check" CHECK ("notes"."kind" <> 'commercial_credit_note'
        OR ("notes"."cgst_paise" = 0 AND "notes"."sgst_paise" = 0 AND "notes"."igst_paise" = 0))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(16) NOT NULL,
	"customer_id" uuid NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"amount_received_paise" bigint NOT NULL,
	"amount_kept_paise" bigint NOT NULL,
	"amount_returned_paise" bigint DEFAULT 0 NOT NULL,
	"reference" varchar(120),
	"reason" text,
	"gatepass_id" uuid,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payments_number_unique" UNIQUE("number"),
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_money_check" CHECK ("payments"."amount_received_paise" >= 0 AND "payments"."amount_kept_paise" >= 0
        AND "payments"."amount_returned_paise" >= 0),
	CONSTRAINT "payments_returned_cash_only_check" CHECK ("payments"."mode" = 'cash' OR "payments"."amount_returned_paise" = 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(16) NOT NULL,
	"customer_id" uuid NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"reference" varchar(120),
	"reason" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refunds_number_unique" UNIQUE("number"),
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_amount_paise_check" CHECK ("refunds"."amount_paise" >= 0)
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
	"order_id" uuid,
	"note_id" uuid,
	"payment_id" uuid,
	"refund_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_paise_check" CHECK ("ledger_entries"."amount_paise" > 0),
	CONSTRAINT "ledger_entries_type_links_check" CHECK (CASE "ledger_entries"."entry_type"
        WHEN 'opening_balance' THEN "ledger_entries"."reason" IS NOT NULL
        WHEN 'bill' THEN "ledger_entries"."order_id" IS NOT NULL AND "ledger_entries"."side" = 'debit'
        WHEN 'credit_note' THEN "ledger_entries"."note_id" IS NOT NULL AND "ledger_entries"."side" = 'credit'
        WHEN 'debit_note' THEN "ledger_entries"."note_id" IS NOT NULL AND "ledger_entries"."side" = 'debit'
        WHEN 'payment' THEN "ledger_entries"."payment_id" IS NOT NULL AND "ledger_entries"."side" = 'credit'
        WHEN 'payment_adjusted' THEN "ledger_entries"."payment_id" IS NOT NULL AND "ledger_entries"."reason" IS NOT NULL
        WHEN 'refund' THEN "ledger_entries"."refund_id" IS NOT NULL AND "ledger_entries"."side" = 'debit'
        WHEN 'refund_adjusted' THEN "ledger_entries"."refund_id" IS NOT NULL AND "ledger_entries"."reason" IS NOT NULL
      END)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"event_type" "money_event_type" NOT NULL,
	"kept_paise" bigint NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reference" varchar(120),
	"previous_kept_paise" bigint,
	"difference_paise" bigint NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_kept_paise_check" CHECK ("payment_events"."kept_paise" >= 0),
	CONSTRAINT "payment_events_shape_check" CHECK (("payment_events"."event_type" = 'posted' AND "payment_events"."previous_kept_paise" IS NULL AND "payment_events"."difference_paise" = 0)
        OR ("payment_events"."event_type" = 'adjusted' AND "payment_events"."previous_kept_paise" IS NOT NULL AND "payment_events"."reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "refund_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"event_type" "money_event_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"reference" varchar(120),
	"previous_amount_paise" bigint,
	"difference_paise" bigint NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_events_amount_paise_check" CHECK ("refund_events"."amount_paise" >= 0),
	CONSTRAINT "refund_events_shape_check" CHECK (("refund_events"."event_type" = 'posted' AND "refund_events"."previous_amount_paise" IS NULL AND "refund_events"."difference_paise" = 0)
        OR ("refund_events"."event_type" = 'adjusted' AND "refund_events"."previous_amount_paise" IS NOT NULL AND "refund_events"."reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_year_id" uuid NOT NULL,
	"series" "document_series" NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_sequences_last_seq_check" CHECK ("document_sequences"."last_seq" >= 0 AND "document_sequences"."last_seq" <= 999999)
);
--> statement-breakpoint
CREATE TABLE "financial_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(5) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"bill_prefix" varchar(6) DEFAULT 'MB' NOT NULL,
	"credit_note_prefix" varchar(6) DEFAULT 'MC' NOT NULL,
	"debit_note_prefix" varchar(6) DEFAULT 'MD' NOT NULL,
	"payment_prefix" varchar(6) DEFAULT 'MP' NOT NULL,
	"refund_prefix" varchar(6) DEFAULT 'MR' NOT NULL,
	"gst_credit_note_deadline" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "financial_years_label_unique" UNIQUE("label"),
	CONSTRAINT "financial_years_starts_on_unique" UNIQUE("starts_on"),
	CONSTRAINT "financial_years_label_check" CHECK ("financial_years"."label" ~ '^[0-9]{2}-[0-9]{2}$'),
	CONSTRAINT "financial_years_dates_check" CHECK (extract(month from "financial_years"."starts_on") = 4 AND extract(day from "financial_years"."starts_on") = 1
        AND "financial_years"."ends_on" = ("financial_years"."starts_on" + interval '1 year' - interval '1 day')::date),
	CONSTRAINT "financial_years_prefix_length_check" CHECK (char_length("financial_years"."bill_prefix") BETWEEN 1 AND 3
        AND char_length("financial_years"."credit_note_prefix") BETWEEN 1 AND 3
        AND char_length("financial_years"."debit_note_prefix") BETWEEN 1 AND 3
        AND char_length("financial_years"."payment_prefix") BETWEEN 1 AND 3
        AND char_length("financial_years"."refund_prefix") BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "gstr1_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" varchar(7) NOT NULL,
	"filing_date" date NOT NULL,
	"reference" varchar(120) NOT NULL,
	"notes" text,
	"filed_by" uuid NOT NULL,
	"corrected_by" uuid,
	"corrected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gstr1_filings_month_unique" UNIQUE("month"),
	CONSTRAINT "gstr1_filings_month_check" CHECK ("gstr1_filings"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "gstr1_filings_filing_date_check" CHECK ("gstr1_filings"."filing_date" >= to_date("gstr1_filings"."month" || '-01', 'YYYY-MM-DD'))
);
--> statement-breakpoint
CREATE TABLE "seller_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"address" text NOT NULL,
	"gstin" varchar(15) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"state" varchar(64) NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seller_settings_singleton_check" CHECK ("seller_settings"."id" = 1),
	CONSTRAINT "seller_settings_gstin_check" CHECK (char_length("seller_settings"."gstin") = 15)
);
--> statement-breakpoint
CREATE TABLE "seed_loads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"cutoff_date" date NOT NULL,
	"filled_by" varchar(120) NOT NULL,
	"loaded_by" uuid NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"route_count" integer NOT NULL,
	"variety_count" integer NOT NULL,
	"customer_count" integer NOT NULL,
	"opening_count" integer NOT NULL,
	CONSTRAINT "seed_loads_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "seed_loads_singleton_check" CHECK ("seed_loads"."singleton")
);
--> statement-breakpoint
CREATE TABLE "notification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider_message_id" varchar(200),
	"provider_media_id" varchar(200),
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_attempts_attempt_number_check" CHECK ("notification_attempts"."attempt_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "notification_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_key" varchar(300) NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_webhook_events_provider_event_key_unique" UNIQUE("provider_event_key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"recipient" varchar(20),
	"content" jsonb NOT NULL,
	"business_ref" jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_idempotency_key_unique" UNIQUE("idempotency_key")
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
ALTER TABLE "route_prices" ADD CONSTRAINT "route_prices_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_prices" ADD CONSTRAINT "route_prices_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variety_tax_periods" ADD CONSTRAINT "variety_tax_periods_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD CONSTRAINT "gatepasses_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD CONSTRAINT "gatepass_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesman_id_salesmen_id_fk" FOREIGN KEY ("salesman_id") REFERENCES "public"."salesmen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_by_profiles_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_irn_recorded_by_profiles_id_fk" FOREIGN KEY ("irn_recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_irn_corrected_by_profiles_id_fk" FOREIGN KEY ("irn_corrected_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_version_lines" ADD CONSTRAINT "bill_version_lines_bill_version_id_bill_versions_id_fk" FOREIGN KEY ("bill_version_id") REFERENCES "public"."bill_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_version_lines" ADD CONSTRAINT "bill_version_lines_variety_id_product_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."product_varieties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_versions" ADD CONSTRAINT "bill_versions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_bill_version_line_id_bill_version_lines_id_fk" FOREIGN KEY ("bill_version_line_id") REFERENCES "public"."bill_version_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_gatepass_id_gatepasses_id_fk" FOREIGN KEY ("gatepass_id") REFERENCES "public"."gatepasses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_events" ADD CONSTRAINT "refund_events_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_financial_year_id_financial_years_id_fk" FOREIGN KEY ("financial_year_id") REFERENCES "public"."financial_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr1_filings" ADD CONSTRAINT "gstr1_filings_filed_by_profiles_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr1_filings" ADD CONSTRAINT "gstr1_filings_corrected_by_profiles_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_settings" ADD CONSTRAINT "seller_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_loads" ADD CONSTRAINT "seed_loads_loaded_by_profiles_id_fk" FOREIGN KEY ("loaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routes_name_lower_unique" ON "routes" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_varieties_product_name_unique" ON "product_varieties" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "route_prices_route_variety_unique" ON "route_prices" USING btree ("route_id","variety_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variety_tax_periods_variety_effective_from_unique" ON "variety_tax_periods" USING btree ("variety_id","effective_from");--> statement-breakpoint
CREATE INDEX "variety_tax_periods_lookup_idx" ON "variety_tax_periods" USING btree ("variety_id","effective_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_route_id_idx" ON "customers" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepasses_salesman_active_business_date_unique" ON "gatepasses" USING btree ("salesman_id","business_date") WHERE "gatepasses"."status" = 'active';--> statement-breakpoint
CREATE INDEX "gatepasses_route_id_idx" ON "gatepasses" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gatepass_items_gatepass_variety_unique" ON "gatepass_items" USING btree ("gatepass_id","variety_id");--> statement-breakpoint
CREATE INDEX "orders_route_id_idx" ON "orders" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "orders_gatepass_id_idx" ON "orders" USING btree ("gatepass_id");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_bill_date_idx" ON "orders" USING btree ("bill_date");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variety_unique" ON "order_items" USING btree ("order_id","variety_id");--> statement-breakpoint
CREATE INDEX "bill_version_lines_bill_version_id_idx" ON "bill_version_lines" USING btree ("bill_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_versions_order_version_unique" ON "bill_versions" USING btree ("order_id","version_number");--> statement-breakpoint
CREATE INDEX "note_lines_note_id_idx" ON "note_lines" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_lines_bill_version_line_id_idx" ON "note_lines" USING btree ("bill_version_line_id");--> statement-breakpoint
CREATE INDEX "notes_order_id_idx" ON "notes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_customer_occurred_at_idx" ON "payments" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "refunds_customer_occurred_at_idx" ON "refunds" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_customer_occurred_at_idx" ON "ledger_entries" USING btree ("customer_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_opening_per_customer" ON "ledger_entries" USING btree ("customer_id") WHERE "ledger_entries"."entry_type" = 'opening_balance';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_bill_per_order" ON "ledger_entries" USING btree ("order_id") WHERE "ledger_entries"."entry_type" = 'bill';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_one_per_note" ON "ledger_entries" USING btree ("note_id") WHERE "ledger_entries"."note_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_entries_payment_id_idx" ON "ledger_entries" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_refund_id_idx" ON "ledger_entries" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_occurred_at_idx" ON "payment_events" USING btree ("payment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "refund_events_refund_occurred_at_idx" ON "refund_events" USING btree ("refund_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sequences_year_series_unique" ON "document_sequences" USING btree ("financial_year_id","series");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_notification_attempt_unique" ON "notification_attempts" USING btree ("notification_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempts_provider_message_id_unique" ON "notification_attempts" USING btree ("provider_message_id") WHERE "notification_attempts"."provider_message_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");