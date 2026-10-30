import { TRPCClientError } from "@repo/trpc/client";

import type { TranslateValues } from "~/locale/translate";

type Translate = (key: string, values?: TranslateValues) => string;

// What browsers and Node say when a request never got an answer.
const networkFailureMessages = [
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "fetch failed",
];

/**
 * True when the call never got an answer from the API: offline, a dropped connection, or a reply
 * that was not the API's own (a proxy error page). A tRPC error the server made always has `data`.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TRPCClientError) return !error.data;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return error instanceof Error && networkFailureMessages.includes(error.message);
}

/**
 * Plain words for a failed call, in the user's language. Never the server's own text: it can carry
 * SQL, Supabase errors or internal ids. A lost connection, an ended session, a missing permission
 * or record and bad input get their own message; anything else gets the screen's fallback
 * ("Could not create product. Try again.").
 */
export function getErrorMessage(tx: Translate, error: unknown, fallbackMessage: string): string {
  if (isNetworkError(error)) return tx("common.errors.network");
  if (error instanceof TRPCClientError) {
    const data = error.data as { code?: string; issues?: unknown[] | null } | undefined;
    switch (data?.code) {
      case "UNAUTHORIZED":
        return tx("common.errors.sessionEnded");
      case "FORBIDDEN":
        return tx("common.errors.forbidden");
      case "NOT_FOUND":
        return tx("common.errors.notFound");
      case "TOO_MANY_REQUESTS":
        return tx("common.errors.tooManyRequests");
    }
    if (data?.issues) return tx("common.errors.invalidInput");
  }
  return fallbackMessage;
}
