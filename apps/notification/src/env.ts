import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().optional(),
  // 127.0.0.1 on the host; the Docker image sets 0.0.0.0 and publishes only 127.0.0.1:<port>.
  HOST: z.string().default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Shared with the main API; not the app JWT secret and not the Supabase service-role key.
  NOTIFICATION_INTERNAL_API_KEY: z
    .string()
    .min(32, "NOTIFICATION_INTERNAL_API_KEY must be at least 32 characters"),

  // Meta WhatsApp Cloud API (system-user token).
  META_ACCESS_TOKEN: z.string().min(1),
  META_PHONE_NUMBER_ID: z.string().min(1),
  // HMAC key for the webhook `X-Hub-Signature-256`.
  META_APP_SECRET: z.string().min(1),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // Self-hosted Inngest server in the same container.
  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),
  INNGEST_BASE_URL: z.string().url().default("http://127.0.0.1:8288"),

  // Private Documents bucket (Spec L) with this app's own read-only R2 key.
  NOTIFICATION_R2_ENDPOINT: z.string().url().describe("https://<account>.r2.cloudflarestorage.com"),
  NOTIFICATION_R2_ACCESS_KEY_ID: z.string().min(1),
  NOTIFICATION_R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_DOCUMENTS_BUCKET_NAME: z.string().min(1),
});

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
