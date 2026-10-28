import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { notificationsTable } from "@repo/database/schema";

import { notificationRefused } from "../errors";
import NotificationService, { MetaWhatsAppProvider } from "../notification";
import type {
  DocumentReader,
  NotificationDispatcher,
  NotificationTokenStore,
  ReadDocumentResult,
  SendTemplateInput,
  SendTemplateResult,
  TokenCheckResult,
  UploadMediaResult,
  WhatsAppProvider,
  WhatsAppTokenSource,
} from "../notification";
import type {
  NotificationTokenGateway,
  ResumeHeldResult,
  WhatsAppTokenStatus,
} from "../whatsapp-token";

// Fakes for the notification seam: tests never call Meta, R2 or Inngest.

export const DEFAULT_TEST_TOKEN = "EAAG-test-working-token";

export class FakeWhatsAppProvider implements WhatsAppProvider {
  public readonly providerName = "meta_whatsapp";
  public readonly mediaErrorCode = 131053;

  public readonly uploads: { bytes: Uint8Array; mimeType: string; filename: string }[] = [];
  public readonly sends: SendTemplateInput[] = [];

  private readonly scriptedUploads: UploadMediaResult[] = [];
  private readonly scriptedSends: SendTemplateResult[] = [];
  // The real Meta parser, so webhook tests read real payload shapes.
  private readonly webhookParser = new MetaWhatsAppProvider({
    tokenSource: { readWorkingToken: async () => null },
    phoneNumberId: "unused",
  });

  // Token checks: a token is `ok` when Meta would accept it; `tokenCheckUnavailable` plays a Meta
  // outage. `checkedTokens` records what was checked (tests only; real code never keeps tokens).
  public readonly validTokens = new Set<string>([DEFAULT_TEST_TOKEN]);
  public tokenCheckUnavailable = false;
  public readonly checkedTokens: (string | null)[] = [];
  public tokenSource: WhatsAppTokenSource | null = null;

  // Results for the next calls, in order; once used up every call succeeds.
  public scriptSends(...results: SendTemplateResult[]): void {
    this.scriptedSends.push(...results);
  }

  public scriptUploads(...results: UploadMediaResult[]): void {
    this.scriptedUploads.push(...results);
  }

  public async uploadMedia(input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
  }): Promise<UploadMediaResult> {
    this.uploads.push(input);
    return this.scriptedUploads.shift() ?? { ok: true, mediaId: `media-${randomUUID()}` };
  }

  public async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
    this.sends.push(input);
    return this.scriptedSends.shift() ?? { ok: true, providerMessageId: `wamid.${randomUUID()}` };
  }

  public async checkToken(token?: string): Promise<TokenCheckResult> {
    const candidate = token ?? (await this.tokenSource?.readWorkingToken()) ?? null;
    this.checkedTokens.push(candidate);
    if (this.tokenCheckUnavailable) return "unavailable";
    return candidate !== null && this.validTokens.has(candidate) ? "ok" : "auth_error";
  }

  public parseStatusWebhook(payload: unknown) {
    return this.webhookParser.parseStatusWebhook(payload);
  }
}

export class FakeDocumentReader implements DocumentReader {
  public readonly reads: string[] = [];
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private readonly unavailableKeys = new Set<string>();

  public put(objectKey: string, contentType = "application/pdf", bytes?: Uint8Array): void {
    this.objects.set(objectKey, {
      bytes: bytes ?? new TextEncoder().encode(`%PDF-1.7 ${objectKey}`),
      contentType,
    });
  }

  public makeUnavailable(objectKey: string): void {
    this.unavailableKeys.add(objectKey);
  }

  public async read(objectKey: string): Promise<ReadDocumentResult> {
    this.reads.push(objectKey);
    if (this.unavailableKeys.has(objectKey)) {
      return { ok: false, reason: "unavailable", message: "R2 returned 503" };
    }
    const object = this.objects.get(objectKey);
    if (!object)
      return { ok: false, reason: "not_found", message: `R2 object ${objectKey} not found` };
    return { ok: true, bytes: object.bytes, contentType: object.contentType };
  }
}

export class FakeDispatcher implements NotificationDispatcher {
  public readonly dispatched: { notificationId: string; runKey: string }[] = [];
  public failDispatch = false;
  public healthy = true;

  public async dispatch(notificationId: string, runKey: string): Promise<void> {
    if (this.failDispatch) throw new Error("Inngest is down");
    this.dispatched.push({ notificationId, runKey });
  }

  public async isHealthy(): Promise<boolean> {
    return this.healthy;
  }
}

// The token store when a test does not care about tokens: an in-memory working copy and Vault.
export class MemoryTokenStore implements NotificationTokenStore {
  public workingToken: string | null = DEFAULT_TEST_TOKEN;
  public vaultToken: string | null = DEFAULT_TEST_TOKEN;

  public async readWorkingToken(): Promise<string | null> {
    return this.workingToken;
  }

  public async readVaultToken(): Promise<string | null> {
    return this.vaultToken;
  }

  public async writeWorkingToken(token: string): Promise<void> {
    this.workingToken = token;
  }
}

export const testWebhookSecrets = {
  appSecret: "test-meta-app-secret",
  verifyToken: "test-verify-token",
};

export interface NotificationHarness {
  service: NotificationService;
  provider: FakeWhatsAppProvider;
  documentReader: FakeDocumentReader;
  dispatcher: FakeDispatcher;
  tokenStore: NotificationTokenStore;
}

export interface NotificationHarnessOptions {
  // A real WhatsAppTokenStore for token tests; an in-memory one otherwise.
  tokenStore?: NotificationTokenStore;
  // Wait before the sync a held send asks for; long by default so other tests never see it.
  tokenSyncDelayMs?: number;
}

export function buildNotificationHarness(
  options: NotificationHarnessOptions = {},
): NotificationHarness {
  const provider = new FakeWhatsAppProvider();
  const documentReader = new FakeDocumentReader();
  const dispatcher = new FakeDispatcher();
  const tokenStore = options.tokenStore ?? new MemoryTokenStore();
  provider.tokenSource = tokenStore;
  const service = new NotificationService({
    provider,
    documentReader,
    dispatcher,
    webhook: testWebhookSecrets,
    tokenStore,
    tokenSyncDelayMs: options.tokenSyncDelayMs ?? 10 * 60 * 1000,
  });
  return { service, provider, documentReader, dispatcher, tokenStore };
}

// The run key a dispatch of the notification's current run carries: its run start (updated_at).
export async function currentRunKey(notificationId: string): Promise<string> {
  const [row] = await db
    .select({ updatedAt: notificationsTable.updatedAt })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId));
  return `notification/${notificationId}/run/${row!.updatedAt.getTime()}`;
}

// The notification app as the main API sees it (Spec J-0): token status, refresh and resume.
export class FakeNotificationTokenGateway implements NotificationTokenGateway {
  public status: WhatsAppTokenStatus = { state: "ok", checkedAt: new Date(), heldCount: 0 };
  public queued = 0;
  // `down` plays an unreachable notification app; `refuseResume` a token that does not work.
  public down = false;
  public refuseResume = false;
  public refreshCalls = 0;
  public resumeCalls = 0;

  public async tokenStatus(): Promise<WhatsAppTokenStatus> {
    if (this.down) throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:8100");
    return this.status;
  }

  public async refreshToken(): Promise<WhatsAppTokenStatus> {
    if (this.down) throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:8100");
    this.refreshCalls += 1;
    return this.status;
  }

  public async resumeHeld(): Promise<ResumeHeldResult> {
    if (this.down) throw new Error("fetch failed: ECONNREFUSED 127.0.0.1:8100");
    this.resumeCalls += 1;
    if (this.refuseResume) {
      throw notificationRefused("token_not_working", "WhatsApp messages are paused");
    }
    return { queued: this.queued };
  }
}

// A Meta token check that accepts only `validTokens`; `unavailable` plays a Meta outage.
export class FakeTokenChecker {
  public readonly validTokens = new Set<string>();
  public unavailable = false;
  public checks = 0;

  public async checkToken(token?: string): Promise<TokenCheckResult> {
    this.checks += 1;
    if (this.unavailable) return "unavailable";
    return token !== undefined && this.validTokens.has(token) ? "ok" : "auth_error";
  }
}
