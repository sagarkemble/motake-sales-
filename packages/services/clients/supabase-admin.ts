import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "../env";

let supabaseAdminClientInstance: SupabaseClient | undefined;

export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClientInstance) {
    supabaseAdminClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    });
  }
  return supabaseAdminClientInstance;
}

export const supabaseAdminClient = getSupabaseAdminClient();
