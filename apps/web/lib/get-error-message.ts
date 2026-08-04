import { TRPCClientError } from "@repo/trpc/client";

export function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof TRPCClientError && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessage;
}
