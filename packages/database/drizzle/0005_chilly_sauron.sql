CREATE TYPE "public"."gatepass_short_reason" AS ENUM('damaged', 'expired', 'lost', 'leaked', 'other');--> statement-breakpoint
ALTER TABLE "gatepasses" ADD COLUMN "discrepancy_reason" text;--> statement-breakpoint
ALTER TABLE "gatepasses" ADD COLUMN "handover_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD COLUMN "short_reason" "gatepass_short_reason";--> statement-breakpoint
ALTER TABLE "gatepass_items" ADD COLUMN "short_note" text;
