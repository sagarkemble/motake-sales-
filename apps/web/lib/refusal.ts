import { TRPCClientError } from "@repo/trpc/client";

import { getErrorMessage } from "~/lib/get-error-message";

interface RefusalShape {
  reason: string;
  details: Record<string, unknown> | null;
}

/** The machine-readable refusal a tRPC call was refused with (`error.data.refusal`), if any. */
export function refusalOf(error: unknown): RefusalShape | null {
  if (!(error instanceof TRPCClientError)) return null;
  const refusal = (error.data as { refusal?: RefusalShape | null } | undefined)?.refusal;
  return refusal ?? null;
}

/**
 * Copy for a refused call: the locale string for its reason under `admin.ledger.refusals`, else
 * the server's message, else the fallback.
 */
export function refusalMessage(
  tx: (key: string, values?: Record<string, string | number>) => string,
  error: unknown,
  fallbackMessage: string,
): string {
  const refusal = refusalOf(error);
  if (refusal) {
    const key = `admin.ledger.refusals.${refusal.reason}`;
    const message = tx(key);
    if (message !== key) return message;
  }
  return getErrorMessage(tx, error, fallbackMessage);
}

// A failure with no answer from the server (network drop, timeout, 5xx): the write may or may not
// have happened, so the next try must reuse the key and the admin should check the Ledger first.
export function isOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return true;
  const httpStatus = (error.data as { httpStatus?: number } | undefined)?.httpStatus;
  return typeof httpStatus !== "number" || httpStatus >= 500;
}
