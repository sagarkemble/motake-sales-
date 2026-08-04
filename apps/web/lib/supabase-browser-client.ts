import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "./env";

let supabaseBrowserClientInstance: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!supabaseBrowserClientInstance) {
    supabaseBrowserClientInstance = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return supabaseBrowserClientInstance;
}

export const supabaseBrowserClient = getSupabaseBrowserClient();
