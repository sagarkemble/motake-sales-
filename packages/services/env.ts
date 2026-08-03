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
    SUPABASE_URL: z
      .url()
      .describe("Supabase project URL")
      .default("https://tepotokyvgduigzbkoui.supabase.co"),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1)
      .describe(
        "Supabase service role key. Bypasses RLS; server-only, never expose in client-side code.",
      )
      .default("sb_secret_jIBaBofRTT5CVuQgIglHRA_znTS4Zwg"),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production" && val.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be at least 32 characters in production",
      });
    }
  });

function createEnv(env: NodeJS.ProcessEnv) {
  const safeParseResult = envSchema.safeParse(env);
  if (!safeParseResult.success) throw new Error(safeParseResult.error.message);
  return safeParseResult.data;
}

export const env = createEnv(process.env);
