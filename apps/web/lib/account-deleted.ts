import { refusalOf } from "~/lib/refusal";
import { supabaseBrowserClient } from "~/lib/supabase-browser-client";

let signingOut = false;

// The server refuses every request of a removed account as account_deleted.
export function isAccountDeleted(error: unknown): boolean {
  return refusalOf(error)?.reason === "account_deleted";
}

// Signs the removed account out (AuthSessionSync clears the cookie, cache and cart on SIGNED_OUT)
// and sends it to the login page. Runs once however many requests were refused.
export function signOutIfAccountDeleted(error: unknown): void {
  if (signingOut || !isAccountDeleted(error)) return;
  signingOut = true;
  void supabaseBrowserClient.auth
    .signOut({ scope: "local" })
    .catch(() => undefined)
    .finally(() => window.location.replace("/login?removed=1"));
}
