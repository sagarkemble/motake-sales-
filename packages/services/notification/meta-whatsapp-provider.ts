import type { FailureCategory, ProviderStatusUpdate } from "./model";
import {
  formatProviderError,
  type ProviderFailure,
  type SendTemplateInput,
  type SendTemplateResult,
  type TokenCheckResult,
  type UploadMediaResult,
  type WhatsAppProvider,
  type WhatsAppTokenSource,
} from "./provider";

// Pinned so a Meta default-version change cannot break sends. Changing it is a reviewed code change.
export const META_GRAPH_API_VERSION = "v26.0";

const META_GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_TIMEOUT_MS = 20_000;
const MEDIA_ERROR_CODE = 131053;

// #6 research, #9. Every code not listed here is terminal.
const TRANSIENT_CODES: Record<number, FailureCategory> = {
  2: "provider_unavailable",
  4: "rate_limited",
  80007: "rate_limited",
  130429: "rate_limited",
  131016: "provider_unavailable",
  131056: "rate_limited",
  133004: "provider_unavailable",
};

const TERMINAL_CODES: Record<number, FailureCategory> = {
  0: "auth_error",
  3: "auth_error",
  10: "auth_error",
  190: "auth_error",
  130403: "opted_out_or_blocked",
  131050: "opted_out_or_blocked",
  131047: "window_closed",
  131005: "auth_error",
  131008: "template_error",
  131009: "template_error",
  131026: "invalid_recipient",
  131030: "invalid_recipient",
  // Business eligibility payment issue: the WhatsApp account cannot pay. Held, not failed (Spec J-0).
  131042: "payment_error",
  131045: "auth_error",
  // Ecosystem limit: wait 24 hours; an Admin can resend later.
  131049: "rate_limited",
  131053: "media_error",
  132000: "template_error",
  132001: "template_error",
  132012: "template_error",
  132015: "template_error",
  132016: "template_error",
};

// Network errors raised before the request left this host; the request was never written.
const UNSENT_NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

export interface MetaWhatsAppProviderConfig {
  // Asked on every Meta call, so a new token in the secret file is used at once (Spec J-0).
  tokenSource: WhatsAppTokenSource;
  phoneNumberId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface MetaErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_data?: { details?: string };
  };
}

interface MetaWebhookError {
  code?: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface MetaWebhookStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: MetaWebhookError[];
}

interface MetaWebhookBody {
  entry?: { changes?: { value?: { statuses?: MetaWebhookStatus[] } }[] }[];
}

// Classifies a Meta error code (and the HTTP status when there is one).
export function classifyMetaError(
  code: number | null,
  httpStatus: number | null,
): { retriable: boolean; category: FailureCategory } {
  if (code !== null && TRANSIENT_CODES[code]) {
    return { retriable: true, category: TRANSIENT_CODES[code] };
  }
  if (code !== null && code >= 200 && code <= 299) {
    return { retriable: false, category: "auth_error" };
  }
  if (code !== null && TERMINAL_CODES[code]) {
    return { retriable: false, category: TERMINAL_CODES[code] };
  }
  if (httpStatus !== null && httpStatus >= 500) {
    return { retriable: true, category: "provider_unavailable" };
  }
  if (code === null && httpStatus === 429) {
    return { retriable: true, category: "rate_limited" };
  }
  return { retriable: false, category: "unknown" };
}

function failure(code: number | null, httpStatus: number | null, message: string): ProviderFailure {
  return { ok: false, ...classifyMetaError(code, httpStatus), code, message };
}

function errorCodeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

// A thrown fetch: a timeout or a reset after the request was written is ambiguous (Meta may have
// sent it); a connect failure is plainly unavailable. Both are retried.
function transportFailure(error: unknown): ProviderFailure {
  const message = error instanceof Error ? error.message : String(error);
  const networkCode = errorCodeOf(error);
  if (networkCode && UNSENT_NETWORK_ERROR_CODES.has(networkCode)) {
    return {
      ok: false,
      retriable: true,
      category: "provider_unavailable",
      code: null,
      message: `${networkCode}: ${message}`,
    };
  }
  return { ok: false, retriable: true, category: "ambiguous", code: null, message };
}

// No token to send with: held like an expired one (Spec J-0), and Meta is never called.
const NO_TOKEN_FAILURE: ProviderFailure = {
  ok: false,
  retriable: false,
  category: "auth_error",
  code: null,
  message: "No WhatsApp access token in the secret file",
};

async function failureFromResponse(response: Response): Promise<ProviderFailure> {
  let body: MetaErrorBody | undefined;
  try {
    body = (await response.json()) as MetaErrorBody;
  } catch {
    body = undefined;
  }
  const code = typeof body?.error?.code === "number" ? body.error.code : null;
  const message =
    body?.error?.error_data?.details ?? body?.error?.message ?? `HTTP ${response.status}`;
  return failure(code, response.status, message);
}

// WhatsApp Cloud API adapter (#6 research). Sends templates only.
export class MetaWhatsAppProvider implements WhatsAppProvider {
  public readonly providerName = "meta_whatsapp";
  public readonly mediaErrorCode = MEDIA_ERROR_CODE;

  private readonly tokenSource: WhatsAppTokenSource;
  private readonly phoneNumberId: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(config: MetaWhatsAppProviderConfig) {
    this.tokenSource = config.tokenSource;
    this.phoneNumberId = config.phoneNumberId;
    this.fetchImplementation = config.fetch ?? globalThis.fetch;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private url(path: "messages" | "media"): string {
    return `${META_GRAPH_BASE_URL}/${META_GRAPH_API_VERSION}/${this.phoneNumberId}/${path}`;
  }

  // The working token, or a failure to return instead of calling Meta. A secret file that cannot
  // be read is transient (retried); a missing or blank one is an auth error (held).
  private async workingToken(): Promise<{ ok: true; token: string } | ProviderFailure> {
    let token: string | null;
    try {
      token = await this.tokenSource.readWorkingToken();
    } catch (error) {
      return {
        ok: false,
        retriable: true,
        category: "provider_unavailable",
        code: null,
        message: `Could not read the WhatsApp access token: ${
          (error as { code?: unknown } | null)?.code ?? "read error"
        }`,
      };
    }
    return token ? { ok: true, token } : NO_TOKEN_FAILURE;
  }

  // GET the configured phone number's id: read-only, sends nothing. Meta's auth codes (190 and
  // the rest classified as auth_error) mean the token is refused; anything else is unavailable.
  public async checkToken(token?: string): Promise<TokenCheckResult> {
    let candidate: string | null;
    try {
      candidate = token?.trim() || (await this.tokenSource.readWorkingToken());
    } catch {
      return "unavailable";
    }
    if (!candidate) return "auth_error";

    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${META_GRAPH_BASE_URL}/${META_GRAPH_API_VERSION}/${this.phoneNumberId}?fields=id`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${candidate}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
    } catch {
      return "unavailable";
    }
    if (response.ok) return "ok";
    const refusal = await failureFromResponse(response);
    return refusal.category === "auth_error" ? "auth_error" : "unavailable";
  }

  public async uploadMedia(input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
  }): Promise<UploadMediaResult> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", input.mimeType);
    form.append(
      "file",
      new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
      input.filename,
    );

    const accessToken = await this.workingToken();
    if (!accessToken.ok) return accessToken;

    let response: Response;
    try {
      response = await this.fetchImplementation(this.url("media"), {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken.token}` },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return transportFailure(error);
    }
    if (!response.ok) return failureFromResponse(response);

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    if (!body.id) return failure(null, response.status, "Media upload returned no id");
    return { ok: true, mediaId: body.id };
  }

  public async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
    const components: Record<string, unknown>[] = [];
    if (input.header?.type === "document") {
      components.push({
        type: "header",
        parameters: [
          {
            type: "document",
            document: { id: input.header.mediaId, filename: input.header.filename },
          },
        ],
      });
    } else if (input.header?.type === "image") {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { id: input.header.mediaId } }],
      });
    }
    if (input.bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: input.bodyParams.map((text) => ({ type: "text", text })),
      });
    }

    const requestBody = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    const accessToken = await this.workingToken();
    if (!accessToken.ok) return accessToken;

    let response: Response;
    try {
      response = await this.fetchImplementation(this.url("messages"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return transportFailure(error);
    }
    if (!response.ok) return failureFromResponse(response);

    const body = (await response.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    const providerMessageId = body.messages?.[0]?.id;
    if (!providerMessageId) {
      return failure(null, response.status, "Send returned no message id");
    }
    return { ok: true, providerMessageId };
  }

  // `entry[].changes[].value.statuses[]`; inbound `messages[]` are ignored.
  public parseStatusWebhook(payload: unknown): ProviderStatusUpdate[] {
    const body = (payload ?? {}) as MetaWebhookBody;
    const updates: ProviderStatusUpdate[] = [];
    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const statuses = change?.value?.statuses;
        for (const status of Array.isArray(statuses) ? statuses : []) {
          if (typeof status?.id !== "string" || typeof status.status !== "string") continue;
          updates.push({
            providerMessageId: status.id,
            status: normalizedStatus(status.status),
            timestamp: typeof status.timestamp === "string" ? status.timestamp : "",
            error: statusError(status.errors),
          });
        }
      }
    }
    return updates;
  }
}

function normalizedStatus(metaStatus: string): ProviderStatusUpdate["status"] {
  switch (metaStatus) {
    case "sent":
    case "delivered":
    case "read":
    case "failed":
      return metaStatus;
    default:
      // `played`, `deleted`, `warning` and anything new.
      return "other";
  }
}

function statusError(errors: MetaWebhookError[] | undefined): string | null {
  const firstError = Array.isArray(errors) ? errors[0] : undefined;
  if (!firstError) return null;
  const code = typeof firstError.code === "number" ? firstError.code : null;
  const message =
    firstError.error_data?.details ?? firstError.message ?? firstError.title ?? "Delivery failed";
  return formatProviderError({ category: classifyMetaError(code, null).category, code, message });
}
