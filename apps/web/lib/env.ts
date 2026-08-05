import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const supabaseUrlSchema = z.url().superRefine((url, ctx) => {
  const parsedUrl = new URL(url);
  const isAllowedHost = parsedUrl.hostname.endsWith(".supabase.co");
  if (!isAllowedHost) {
    ctx.addIssue({ code: "custom", message: "Supabase URL host must end with .supabase.co" });
    return;
  }
  if (parsedUrl.protocol !== "https:") {
    ctx.addIssue({ code: "custom", message: "Supabase URL must use https in production" });
  }
});

export const env = createEnv({
  client: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrlSchema,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
});
