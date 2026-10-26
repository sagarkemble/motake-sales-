import type { FailureCategory, ProviderStatusUpdate } from "./model";

// A provider failure. `retriable` decides retry versus fail-at-once; `code` is the provider's own
// error code (never shown to callers).
export interface ProviderFailure {
  ok: false;
  retriable: boolean;
  category: FailureCategory;
  code: number | null;
  message: string;
}

export type UploadMediaResult = { ok: true; mediaId: string } | ProviderFailure;

export type SendTemplateResult = { ok: true; providerMessageId: string } | ProviderFailure;

export interface TemplateHeader {
  type: "document" | "image";
  mediaId: string;
  filename: string;
}

export interface SendTemplateInput {
  // `+` E.164.
  to: string;
  templateName: string;
  language: string;
  // Values in the template's blank order.
  bodyParams: string[];
  header: TemplateHeader | null;
}

// The only code that knows provider URLs, ids, error codes and status strings sits behind this.
export interface WhatsAppProvider {
  readonly providerName: string;
  // Provider error code meaning the media id could not be used (WhatsApp: 131053).
  readonly mediaErrorCode: number;
  uploadMedia(input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
  }): Promise<UploadMediaResult>;
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult>;
  // Status updates in a verified webhook body; anything else in it is ignored.
  parseStatusWebhook(payload: unknown): ProviderStatusUpdate[];
}

export type ReadDocumentResult =
  | { ok: true; bytes: Uint8Array; contentType: string | null }
  | { ok: false; reason: "not_found" | "unavailable"; message: string };

// Reads one object from the private Documents bucket. Never makes a link.
export interface DocumentReader {
  read(objectKey: string): Promise<ReadDocumentResult>;
}

// Puts a send job on the queue. `runKey` dedupes repeats of the same run.
export interface NotificationDispatcher {
  dispatch(notificationId: string, runKey: string): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export function formatProviderError(failure: Omit<ProviderFailure, "ok" | "retriable">): string {
  const code = failure.code === null ? "" : ` (meta code ${failure.code})`;
  return `${failure.category}: ${failure.message}${code}`;
}
