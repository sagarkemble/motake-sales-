CREATE TYPE "public"."attachment_type" AS ENUM('image', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."message_language" AS ENUM('mr', 'hi', 'en');--> statement-breakpoint
CREATE TYPE "public"."notification_provider" AS ENUM('whatsapp', 'sms');--> statement-breakpoint
CREATE TYPE "public"."template_document_type" AS ENUM('none', 'image', 'pdf');--> statement-breakpoint
CREATE TABLE "notification_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "notification_provider" NOT NULL,
	"object_key" text NOT NULL,
	"provider_media_id" varchar(128) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "notification_provider" NOT NULL,
	"template_id" varchar(128) NOT NULL,
	"language" "message_language" NOT NULL,
	"version" integer NOT NULL,
	"template_variables" jsonb NOT NULL,
	"document_type" "template_document_type" DEFAULT 'none' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_version_check" CHECK ("notification_templates"."version" >= 1),
	CONSTRAINT "notification_templates_variables_check" CHECK (jsonb_typeof("notification_templates"."template_variables") = 'array')
);
--> statement-breakpoint
ALTER TABLE "bill_versions" RENAME COLUMN "pdf_url" TO "pdf_key";--> statement-breakpoint
ALTER TABLE "notes" RENAME COLUMN "pdf_url" TO "pdf_key";--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "attachment_url" TO "attachment_key";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "body_text" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "preferred_language" "message_language" DEFAULT 'mr' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "notification_template_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "template_values" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attachment_type" "attachment_type";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attachment_filename" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "notification_media_provider_object_unique" ON "notification_media" USING btree ("provider","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_templates_version_unique" ON "notification_templates" USING btree ("provider","template_id","language","version");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_notification_template_id_notification_templates_id_fk" FOREIGN KEY ("notification_template_id") REFERENCES "public"."notification_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_template_id_idx" ON "notifications" USING btree ("notification_template_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_values_check" CHECK (jsonb_typeof("notifications"."template_values") = 'object');--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_attachment_check" CHECK (("notifications"."attachment_key" IS NULL AND "notifications"."attachment_type" IS NULL AND "notifications"."attachment_filename" IS NULL) OR ("notifications"."attachment_key" IS NOT NULL AND "notifications"."attachment_type" IS NOT NULL AND "notifications"."attachment_filename" IS NOT NULL));