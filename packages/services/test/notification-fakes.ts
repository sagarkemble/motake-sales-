import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { notificationsTable } from "@repo/database/schema";

import NotificationService, { MetaWhatsAppProvider } from "../notification";
import type {
  DocumentReader,
  NotificationDispatcher,
  ReadDocumentResult,
  SendTemplateInput,
  SendTemplateResult,
  UploadMediaResult,
  WhatsAppProvider,
} from "../notification";

// Fakes for the notification seam: tests never call Meta, R2 or Inngest.

export class FakeWhatsAppProvider implements WhatsAppProvider {
  public readonly providerName = "meta_whatsapp";
  public readonly mediaErrorCode = 131053;

  public readonly uploads: { bytes: Uint8Array; mimeType: string; filename: string }[] = [];
  public readonly sends: SendTemplateInput[] = [];

  private readonly scriptedUploads: UploadMediaResult[] = [];
  private readonly scriptedSends: SendTemplateResult[] = [];
  // The real Meta parser, so webhook tests read real payload shapes.
  private readonly webhookParser = new MetaWhatsAppProvider({
    accessToken: "unused",
    phoneNumberId: "unused",
  });

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

export const testWebhookSecrets = {
  appSecret: "test-meta-app-secret",
  verifyToken: "test-verify-token",
};

export interface NotificationHarness {
  service: NotificationService;
  provider: FakeWhatsAppProvider;
  documentReader: FakeDocumentReader;
  dispatcher: FakeDispatcher;
}

export function buildNotificationHarness(): NotificationHarness {
  const provider = new FakeWhatsAppProvider();
  const documentReader = new FakeDocumentReader();
  const dispatcher = new FakeDispatcher();
  const service = new NotificationService({
    provider,
    documentReader,
    dispatcher,
    webhook: testWebhookSecrets,
  });
  return { service, provider, documentReader, dispatcher };
}

// The run key a dispatch of the notification's current run carries: its run start (updated_at).
export async function currentRunKey(notificationId: string): Promise<string> {
  const [row] = await db
    .select({ updatedAt: notificationsTable.updatedAt })
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId));
  return `notification/${notificationId}/run/${row!.updatedAt.getTime()}`;
}
