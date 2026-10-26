import { asc, db, eq, sql } from "@repo/database";
import {
  notificationAttemptsTable,
  notificationMediaTable,
  notificationsTable,
} from "@repo/database/schema";
import { beforeEach, describe, expect, it } from "vitest";

import { wipeApplicationTables } from "../test/database";
import { buildNotificationTemplate } from "../test/builders";
import { buildNotificationHarness, type NotificationHarness } from "../test/notification-fakes";
import type { EnqueueInput, ProviderFailure } from "./index";

let harness: NotificationHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  harness = buildNotificationHarness();
});

const firstTry = { tryIndex: 0, isFinalTry: false };
const finalTry = { tryIndex: 5, isFinalTry: true };
const billKey = "documents/bills/MB-26-27-000123.pdf";
const billFilename = "Motake Bill MB-26-27-000123.pdf";

let keyCounter = 0;
function instruction(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  keyCounter += 1;
  return {
    idempotencyKey: `send:${keyCounter}`,
    kind: "bill",
    to: "+919800000001",
    provider: "whatsapp",
    templateId: "motake_bill",
    language: "mr",
    values: { bill_number: "MB-26-27-000123", shop_name: "Shree Dairy" },
    businessRef: `bill:${keyCounter}`,
    ...overrides,
  };
}

function metaFailure(overrides: Partial<ProviderFailure>): ProviderFailure {
  return {
    ok: false,
    retriable: false,
    category: "unknown",
    code: null,
    message: "Meta said no",
    ...overrides,
  };
}

async function enqueuePdfBill(overrides: Partial<EnqueueInput> = {}) {
  return harness.service.enqueue(
    instruction({
      attachment: { key: billKey, type: "pdf", filename: billFilename },
      ...overrides,
    }),
  );
}

async function notificationRow(notificationId: string) {
  const [row] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, notificationId));
  return row!;
}

async function attemptRows(notificationId: string) {
  return db
    .select()
    .from(notificationAttemptsTable)
    .where(eq(notificationAttemptsTable.notificationId, notificationId))
    .orderBy(asc(notificationAttemptsTable.attemptNumber));
}

describe("sendAttempt", () => {
  it("writes a sent attempt with the provider id and leaves the row pending", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends({ ok: true, providerMessageId: "wamid.ABC" });

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "sent", failureCategory: null });
    expect((await notificationRow(notificationId)).status).toBe("pending");
    expect(await attemptRows(notificationId)).toMatchObject([
      {
        attemptNumber: 1,
        status: "sent",
        provider: "meta_whatsapp",
        providerMessageId: "wamid.ABC",
        error: null,
      },
    ]);
  });

  it("sends body params in template order, the language code, and no header for a plain template", async () => {
    await buildNotificationTemplate({
      templateId: "motake_bill",
      language: "hi",
      templateVariables: ["shop_name", "bill_number"],
    });
    const { notificationId } = await harness.service.enqueue(instruction({ language: "hi" }));

    await harness.service.sendAttempt(notificationId, firstTry);

    expect(harness.provider.sends).toEqual([
      {
        to: "+919800000001",
        templateName: "motake_bill",
        language: "hi",
        bodyParams: ["Shree Dairy", "MB-26-27-000123"],
        header: null,
      },
    ]);
  });

  it("sends a document header by media id and the attachment file name", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const { notificationId } = await enqueuePdfBill();
    harness.provider.scriptUploads({ ok: true, mediaId: "media-1" });

    await harness.service.sendAttempt(notificationId, firstTry);

    expect(harness.provider.sends[0]!.header).toEqual({
      type: "document",
      mediaId: "media-1",
      filename: billFilename,
    });
    expect(harness.provider.uploads).toMatchObject([
      { mimeType: "application/pdf", filename: billFilename },
    ]);
  });

  it("sends an image header with the object's image type", async () => {
    await buildNotificationTemplate({ templateId: "motake_photo", documentType: "image" });
    harness.documentReader.put("documents/qr.png", "image/png");
    const { notificationId } = await harness.service.enqueue(
      instruction({
        templateId: "motake_photo",
        attachment: { key: "documents/qr.png", type: "image", filename: "qr.png" },
      }),
    );

    await harness.service.sendAttempt(notificationId, firstTry);

    expect(harness.provider.uploads[0]!.mimeType).toBe("image/png");
    expect(harness.provider.sends[0]!.header).toMatchObject({ type: "image", filename: "qr.png" });
  });

  it("gives a failed attempt and a retry on a transient error before the final try", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends(
      metaFailure({
        retriable: true,
        category: "rate_limited",
        code: 130429,
        message: "Rate limit hit",
      }),
    );

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "retry", failureCategory: "rate_limited" });
    expect((await notificationRow(notificationId)).status).toBe("pending");
    expect(await attemptRows(notificationId)).toMatchObject([
      { status: "failed", error: "rate_limited: Rate limit hit (meta code 130429)" },
    ]);
  });

  it("fails the row on a transient error on the final try", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends(
      metaFailure({ retriable: true, category: "provider_unavailable", code: 131016 }),
    );

    const result = await harness.service.sendAttempt(notificationId, finalTry);

    expect(result).toEqual({ outcome: "failed", failureCategory: "provider_unavailable" });
    expect((await notificationRow(notificationId)).status).toBe("failed");
  });

  it("fails the row at once on a terminal error after one attempt", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends(
      metaFailure({ category: "template_error", code: 132001, message: "Template does not exist" }),
    );

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "terminal", failureCategory: "template_error" });
    expect((await notificationRow(notificationId)).status).toBe("failed");
    expect(await attemptRows(notificationId)).toHaveLength(1);
    expect((await harness.service.getStatus(notificationId)).failureCategory).toBe(
      "template_error",
    );
  });

  it("does not call the provider for a suppressed or otherwise non-pending row", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const suppressed = await harness.service.enqueue(instruction());
    await harness.service.suppress({
      notificationId: suppressed.notificationId,
      reason: "newer Bill",
    });
    const skipped = await harness.service.enqueue(instruction({ to: null }));

    const results = [
      await harness.service.sendAttempt(suppressed.notificationId, firstTry),
      await harness.service.sendAttempt(skipped.notificationId, firstTry),
    ];

    expect(results).toEqual([
      { outcome: "noop", failureCategory: null },
      { outcome: "noop", failureCategory: null },
    ]);
    expect(harness.provider.sends).toEqual([]);
  });
});

describe("media cache", () => {
  async function mediaRows() {
    return db.select().from(notificationMediaTable);
  }

  it("reads R2, uploads and caches the media id for 30 days on the first send", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const { notificationId } = await enqueuePdfBill();
    harness.provider.scriptUploads({ ok: true, mediaId: "media-first" });
    const before = Date.now();

    await harness.service.sendAttempt(notificationId, firstTry);

    expect(harness.documentReader.reads).toEqual([billKey]);
    const [media] = await mediaRows();
    expect(media).toMatchObject({
      provider: "whatsapp",
      objectKey: billKey,
      providerMediaId: "media-first",
      filename: billFilename,
      mimeType: "application/pdf",
    });
    const lifetimeMs = media!.expiresAt.getTime() - media!.uploadedAt.getTime();
    expect(lifetimeMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(media!.uploadedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("uploads nothing for a second send of the same key within the window", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const first = await enqueuePdfBill();
    const second = await enqueuePdfBill();

    await harness.service.sendAttempt(first.notificationId, firstTry);
    await harness.service.sendAttempt(second.notificationId, firstTry);

    expect(harness.provider.uploads).toHaveLength(1);
    expect(harness.documentReader.reads).toHaveLength(1);
    expect(harness.provider.sends[1]!.header!.mediaId).toBe(
      harness.provider.sends[0]!.header!.mediaId,
    );
  });

  it("uploads again when the cached id expires in under a day, and updates the row", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const first = await enqueuePdfBill();
    harness.provider.scriptUploads(
      { ok: true, mediaId: "media-old" },
      { ok: true, mediaId: "media-new" },
    );
    await harness.service.sendAttempt(first.notificationId, firstTry);
    await db.update(notificationMediaTable).set({ expiresAt: sql`now() + interval '12 hours'` });
    const second = await enqueuePdfBill();

    await harness.service.sendAttempt(second.notificationId, firstTry);

    expect(harness.provider.uploads).toHaveLength(2);
    expect(harness.provider.sends[1]!.header!.mediaId).toBe("media-new");
    const [media] = await mediaRows();
    expect(media!.providerMediaId).toBe("media-new");
    expect(media!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("reuses the cached id on a resend", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const { notificationId } = await enqueuePdfBill();
    harness.provider.scriptSends(metaFailure({ category: "invalid_recipient", code: 131026 }));
    await harness.service.sendAttempt(notificationId, firstTry);

    await harness.service.resend({ notificationId, to: "+919800000002" });
    await harness.service.sendAttempt(notificationId, firstTry);

    expect(harness.provider.uploads).toHaveLength(1);
    expect(harness.provider.sends).toHaveLength(2);
    expect(harness.provider.sends[1]).toMatchObject({ to: "+919800000002" });
    expect(harness.provider.sends[1]!.header!.mediaId).toBe(
      harness.provider.sends[0]!.header!.mediaId,
    );
  });

  it("uploads once more in the same try when the cached id gets a media error", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const first = await enqueuePdfBill();
    harness.provider.scriptUploads(
      { ok: true, mediaId: "media-stale" },
      { ok: true, mediaId: "media-fresh" },
    );
    await harness.service.sendAttempt(first.notificationId, firstTry);
    const second = await enqueuePdfBill();
    harness.provider.scriptSends(
      metaFailure({ category: "media_error", code: 131053, message: "Media upload error" }),
      { ok: true, providerMessageId: "wamid.FRESH" },
    );

    const result = await harness.service.sendAttempt(second.notificationId, firstTry);

    expect(result.outcome).toBe("sent");
    expect(harness.provider.uploads).toHaveLength(2);
    expect(harness.provider.sends.map((send) => send.header!.mediaId)).toEqual([
      "media-stale",
      "media-stale",
      "media-fresh",
    ]);
    expect(await attemptRows(second.notificationId)).toMatchObject([
      { status: "sent", providerMessageId: "wamid.FRESH" },
    ]);
    expect((await mediaRows())[0]!.providerMediaId).toBe("media-fresh");
  });

  it("fails the row as media_error when the R2 object is missing", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    const { notificationId } = await enqueuePdfBill();

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "terminal", failureCategory: "media_error" });
    expect(harness.provider.sends).toEqual([]);
    expect(await harness.service.getStatus(notificationId)).toMatchObject({
      status: "failed",
      failureCategory: "media_error",
    });
  });

  it("retries an R2 outage as provider_unavailable", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", documentType: "pdf" });
    harness.documentReader.makeUnavailable(billKey);
    const { notificationId } = await enqueuePdfBill();

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "retry", failureCategory: "provider_unavailable" });
    expect((await notificationRow(notificationId)).status).toBe("pending");
  });

  it("fails an image that is not JPEG or PNG as media_error", async () => {
    await buildNotificationTemplate({ templateId: "motake_photo", documentType: "image" });
    harness.documentReader.put("documents/qr.webp", "image/webp");
    const { notificationId } = await harness.service.enqueue(
      instruction({
        templateId: "motake_photo",
        attachment: { key: "documents/qr.webp", type: "image", filename: "qr.webp" },
      }),
    );

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result).toEqual({ outcome: "terminal", failureCategory: "media_error" });
    expect(harness.provider.uploads).toEqual([]);
  });
});
