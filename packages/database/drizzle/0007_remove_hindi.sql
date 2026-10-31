-- Hindi is no longer a message language (db-decision 0018). Hindi Customers move to Marathi.
UPDATE "customers" SET "preferred_language" = 'mr' WHERE "preferred_language" = 'hi';--> statement-breakpoint
-- A sent Hindi message now points at the Marathi row of the same template and version.
UPDATE "notifications" SET "notification_template_id" = "marathi"."id"
FROM "notification_templates" AS "hindi", "notification_templates" AS "marathi"
WHERE "notifications"."notification_template_id" = "hindi"."id"
  AND "hindi"."language" = 'hi'
  AND "marathi"."language" = 'mr'
  AND "marathi"."provider" = "hindi"."provider"
  AND "marathi"."template_id" = "hindi"."template_id"
  AND "marathi"."version" = "hindi"."version";--> statement-breakpoint
DELETE FROM "notification_templates" AS "hindi"
WHERE "hindi"."language" = 'hi'
  AND NOT EXISTS (SELECT 1 FROM "notifications" WHERE "notifications"."notification_template_id" = "hindi"."id");--> statement-breakpoint
-- A Hindi row with no Marathi twin (still referenced) becomes the Marathi row.
UPDATE "notification_templates" SET "language" = 'mr' WHERE "language" = 'hi';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "preferred_language" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "preferred_language" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notification_templates" ALTER COLUMN "language" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."message_language";--> statement-breakpoint
CREATE TYPE "public"."message_language" AS ENUM('mr', 'en');--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "preferred_language" SET DATA TYPE "public"."message_language" USING "preferred_language"::"public"."message_language";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "preferred_language" SET DEFAULT 'mr';--> statement-breakpoint
ALTER TABLE "notification_templates" ALTER COLUMN "language" SET DATA TYPE "public"."message_language" USING "language"::"public"."message_language";
