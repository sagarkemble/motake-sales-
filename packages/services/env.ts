import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    JWT_SECRET: z
      .string()
      .min(8, "JWT_SECRET must be at least 8 characters")
      .describe(
        "Secret key used for signing JWT tokens. Keep secret; never expose in client-side code.",
      ),
    SUPABASE_URL: z.url().describe("Supabase project URL"),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1)
      .describe(
        "Supabase service role key. Bypasses RLS; server-only, never expose in client-side code.",
      ),
    IMAGEKIT_PUBLIC_KEY: z.string().min(1).describe("ImageKit public API key (safe to send to the browser for uploads)"),
    IMAGEKIT_PRIVATE_KEY: z
      .string()
      .min(1)
      .describe("ImageKit private API key. Server-only, never expose in client-side code."),
    IMAGEKIT_URL_ENDPOINT: z
      .url()
      .describe("ImageKit URL endpoint, e.g. https://ik.imagekit.io/your_id, no trailing slash"),
    // Spec J-0: the notification app (typed client) and the Fix access token dialog. Unset
    // in dev without the notification app: the token status then reads `unknown`.
    NOTIFICATION_URL: z
      .url()
      .optional()
      .describe("Notification app base URL, e.g. http://127.0.0.1:8100"),
    NOTIFICATION_INTERNAL_API_KEY: z
      .string()
      .min(32)
      .optional()
      .describe("Shared main API <-> notification app key; not the JWT secret"),
    META_PHONE_NUMBER_ID: z
      .string()
      .min(1)
      .optional()
      .describe("WhatsApp phone number id a pasted access token is checked against"),
    WHATSAPP_TOKEN_VAULT_SECRET_NAME: z
      .string()
      .min(1)
      .default("motake_whatsapp_access_token")
      .describe(
        "Supabase Vault secret holding the WhatsApp access token; same value as the notification app",
      ),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production" && val.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 32 characters in production",
      });
    }

    const supabaseUrl = new URL(val.SUPABASE_URL);
    if (!supabaseUrl.hostname.endsWith(".supabase.co")) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "SUPABASE_URL host must end with .supabase.co",
      });
    }
    if (supabaseUrl.protocol !== "https:") {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "SUPABASE_URL must use https in production",
      });
    }
  });

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
