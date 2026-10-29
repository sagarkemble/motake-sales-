ALTER TABLE "seller_settings" ADD COLUMN "pan" varchar(10);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "bank_account_name" varchar(200);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "bank_name" varchar(120);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "bank_branch" varchar(120);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "bank_account_number" varchar(34);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "bank_ifsc" varchar(11);--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "seller_settings" ADD COLUMN "place" varchar(120);