import { TRPCError } from "@trpc/server";

export const unauthorized = (message = "Not authenticated") =>
  new TRPCError({ code: "UNAUTHORIZED", message });

export const forbidden = (message = "You don't have access to this resource") =>
  new TRPCError({ code: "FORBIDDEN", message });

export const notFound = (message = "Resource not found") =>
  new TRPCError({ code: "NOT_FOUND", message });

export const badRequest = (message = "Bad request") =>
  new TRPCError({ code: "BAD_REQUEST", message });

export const conflict = (message = "Resource conflict") =>
  new TRPCError({ code: "CONFLICT", message });

export const internalError = (message = "Internal server error") =>
  new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });

export const notImplemented = (message = "Not implemented") =>
  new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Not implemented: ${message}` });

export const tooManyRequests = (
  retryAfterMs?: number,
  message = "Too many requests, please slow down",
) =>
  new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message,
    cause:
      retryAfterMs !== undefined ? Object.assign(new Error(message), { retryAfterMs }) : undefined,
  });

export interface UncoveredVariety {
  id: string;
  name: string;
  sku: string;
}

// Every Variety in the request that has no tax period covering `day`, so the caller can refuse the
// whole basket in one go.
export const noCoveringTaxPeriod = (uncoveredVarieties: UncoveredVariety[], day: string) => {
  const names = uncoveredVarieties.map((variety) => variety.name).join(", ");
  const message = `No GST for ${day}, cannot be sold: ${names}`;
  return new TRPCError({
    code: "BAD_REQUEST",
    message,
    cause: Object.assign(new Error(message), { uncoveredVarieties, day }),
  });
};

// A refused call: nothing is written and the app branches on a machine reason. `reason` and
// `details` travel in the cause so the router error formatter hands them to the app as
// `data.refusal`. Each spec keeps its own reason list and HTTP codes on top of `refused`.
export interface Refusal<Reason extends string = string> {
  reason: Reason;
  details: Record<string, unknown> | null;
}

export const refused = <Reason extends string>(
  code: TRPCError["code"],
  reason: Reason,
  message: string,
  details: Record<string, unknown> | null = null,
) => {
  const refusal: Refusal<Reason> = { reason, details };
  return new TRPCError({ code, message, cause: Object.assign(new Error(message), { refusal }) });
};

// The refusal carried by an error, or null for any other error.
export function refusalOf(error: unknown): Refusal | null {
  const cause = error instanceof TRPCError ? error.cause : undefined;
  const refusal = (cause as { refusal?: Refusal } | undefined)?.refusal;
  return refusal ?? null;
}

// Why a Document call was refused, for callers that branch on it (Specs G, I, J).
export type DocumentRefusalReason =
  | "irn_missing"
  | "irn_not_recorded"
  | "irn_not_pending"
  | "not_found"
  | "not_posted_event"
  | "nothing_kept"
  | "bad_image"
  | "forbidden";

const documentRefusalCodes: Record<DocumentRefusalReason, TRPCError["code"]> = {
  irn_missing: "BAD_REQUEST",
  irn_not_recorded: "BAD_REQUEST",
  irn_not_pending: "BAD_REQUEST",
  not_found: "NOT_FOUND",
  not_posted_event: "BAD_REQUEST",
  nothing_kept: "BAD_REQUEST",
  bad_image: "BAD_REQUEST",
  forbidden: "FORBIDDEN",
};

// The message is for the Admin; the reason reaches the app as `data.refusal.reason`.
export const documentRefused = (
  reason: DocumentRefusalReason,
  message: string,
  details: Record<string, unknown> | null = null,
) => refused(documentRefusalCodes[reason], reason, message, details);
