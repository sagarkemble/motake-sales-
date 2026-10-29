import { createHmac } from "node:crypto";

import { asc, db, eq, sql } from "@repo/database";
import { lockNotificationWithTemplate } from "@repo/database/queries/notifications";
import { notificationAttemptsTable, notificationsTable } from "@repo/database/schema";
import { beforeEach, describe, expect, it } from "vitest";

import { wipeApplicationTables } from "../test/database";
import { buildNotificationTemplate } from "../test/builders";
import {
  buildNotificationHarness,
  currentRunKey,
  testWebhookSecrets,
  type NotificationHarness,
} from "../test/notification-fakes";
import type { EnqueueInput, ProviderStatusUpdate } from "./index";

let harness: NotificationHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  harness = buildNotificationHarness();
  await buildNotificationTemplate({ templateId: "motake_bill" });
});

const firstTry = { tryIndex: 0, isFinalTry: false };

let keyCounter = 0;
function instruction(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  keyCounter += 1;
  return {
    idempotencyKey: `lifecycle:${keyCounter}`,
    kind: "bill",
    to: "+919800000001",
    provider: "whatsapp",
    templateId: "motake_bill",
    language: "mr",
    values: { shop_name: "Shree Dairy", bill_number: "MB-26-27-000123" },
    businessRef: `bill:${keyCounter}`,
    ...overrides,
  };
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

// Enqueued and accepted by the provider with the given wamid.
async function sentNotification(wamid: string, overrides: Partial<EnqueueInput> = {}) {
  const { notificationId } = await harness.service.enqueue(instruction(overrides));
  harness.provider.scriptSends({ ok: true, providerMessageId: wamid });
  await harness.service.sendAttempt(notificationId, firstTry);
  return notificationId;
}

function status(
  providerMessageId: string,
  value: ProviderStatusUpdate["status"],
  error: string | null = null,
): ProviderStatusUpdate {
  return { providerMessageId, status: value, timestamp: "1767225600", error };
}

describe("applyProviderStatus", () => {
  it("moves pending to delivered, then read", async () => {
    const notificationId = await sentNotification("wamid.D1");

    expect(await harness.service.applyProviderStatus(status("wamid.D1", "delivered"))).toEqual({
      applied: true,
      status: "delivered",
    });
    await harness.service.applyProviderStatus(status("wamid.D1", "read"));

    expect((await notificationRow(notificationId)).status).toBe("read");
  });

  it("moves pending straight to read when delivered never arrives", async () => {
    const notificationId = await sentNotification("wamid.R1");

    await harness.service.applyProviderStatus(status("wamid.R1", "read"));

    expect((await notificationRow(notificationId)).status).toBe("read");
  });

  it("ignores a duplicate delivered, a late delivered after read, and sent", async () => {
    const notificationId = await sentNotification("wamid.DUP");
    await harness.service.applyProviderStatus(status("wamid.DUP", "delivered"));

    const duplicate = await harness.service.applyProviderStatus(status("wamid.DUP", "delivered"));
    await harness.service.applyProviderStatus(status("wamid.DUP", "read"));
    const late = await harness.service.applyProviderStatus(status("wamid.DUP", "delivered"));
    await harness.service.applyProviderStatus(status("wamid.DUP", "sent"));

    expect(duplicate).toEqual({ applied: false, status: "delivered" });
    expect(late).toEqual({ applied: false, status: "read" });
    expect((await notificationRow(notificationId)).status).toBe("read");
  });

  it("fails a pending row and its attempt on a failed status", async () => {
    const notificationId = await sentNotification("wamid.F1");

    await harness.service.applyProviderStatus(
      status("wamid.F1", "failed", "invalid_recipient: Message undeliverable (meta code 131026)"),
    );

    expect((await notificationRow(notificationId)).status).toBe("failed");
    expect(await attemptRows(notificationId)).toMatchObject([
      {
        status: "failed",
        providerMessageId: "wamid.F1",
        error: "invalid_recipient: Message undeliverable (meta code 131026)",
      },
    ]);
    expect((await harness.service.getStatus(notificationId)).failureCategory).toBe(
      "invalid_recipient",
    );
  });

  it("ignores a failed status after delivered", async () => {
    const notificationId = await sentNotification("wamid.F2");
    await harness.service.applyProviderStatus(status("wamid.F2", "delivered"));

    await harness.service.applyProviderStatus(
      status("wamid.F2", "failed", "unknown: x (meta code 1)"),
    );

    expect((await notificationRow(notificationId)).status).toBe("delivered");
    expect((await attemptRows(notificationId))[0]!.status).toBe("sent");
  });

  it("ignores an unknown message id", async () => {
    const notificationId = await sentNotification("wamid.KNOWN");

    const result = await harness.service.applyProviderStatus(status("wamid.UNKNOWN", "delivered"));

    expect(result).toEqual({ applied: false, status: null });
    expect((await notificationRow(notificationId)).status).toBe("pending");
  });

  it("leaves the notification alone on a late status for an older attempt after a resend", async () => {
    const notificationId = await sentNotification("wamid.OLD");
    await harness.service.applyProviderStatus(
      status("wamid.OLD", "failed", "unknown: x (meta code 1)"),
    );
    await harness.service.resend({ notificationId });

    // Before the new run reaches Meta, then after it does.
    await harness.service.applyProviderStatus(status("wamid.OLD", "read"));
    expect((await notificationRow(notificationId)).status).toBe("pending");
    harness.provider.scriptSends({ ok: true, providerMessageId: "wamid.NEW" });
    await harness.service.sendAttempt(notificationId, firstTry);
    await harness.service.applyProviderStatus(status("wamid.OLD", "delivered"));
    await harness.service.applyProviderStatus(
      status("wamid.OLD", "failed", "unknown: y (meta code 1)"),
    );

    expect((await notificationRow(notificationId)).status).toBe("pending");
    expect((await attemptRows(notificationId)).map((attempt) => attempt.status)).toEqual([
      "failed",
      "sent",
    ]);
  });
});

describe("webhook entry", () => {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              statuses: [
                {
                  id: "wamid.A",
                  status: "delivered",
                  timestamp: "1767225600",
                  recipient_id: "91980",
                },
                {
                  id: "wamid.B",
                  status: "failed",
                  timestamp: "1767225601",
                  recipient_id: "91981",
                  errors: [
                    {
                      code: 131026,
                      title: "Message undeliverable",
                      message: "Message undeliverable",
                      error_data: { details: "Recipient is not on WhatsApp" },
                    },
                  ],
                },
                { id: "wamid.C", status: "played", timestamp: "1767225602" },
              ],
              messages: [{ from: "91980", id: "wamid.IN", type: "text", text: { body: "hi" } }],
            },
          },
        ],
      },
    ],
  });

  function signatureOf(body: string, secret = testWebhookSecrets.appSecret) {
    return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }

  it("rejects a missing or bad signature", () => {
    expect(harness.service.handleWebhookPost(payload, undefined)).toEqual({ accepted: false });
    expect(harness.service.handleWebhookPost(payload, "sha256=deadbeef")).toEqual({
      accepted: false,
    });
    expect(
      harness.service.handleWebhookPost(payload, signatureOf(payload, "wrong-secret")),
    ).toEqual({
      accepted: false,
    });
    expect(harness.service.handleWebhookPost(`${payload} `, signatureOf(payload))).toEqual({
      accepted: false,
    });
  });

  it("accepts a good signature over the raw bytes and extracts its statuses", () => {
    const result = harness.service.handleWebhookPost(Buffer.from(payload), signatureOf(payload));

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.statuses).toMatchObject([
      { providerMessageId: "wamid.A", status: "delivered", timestamp: "1767225600", error: null },
      {
        providerMessageId: "wamid.B",
        status: "failed",
        error: "invalid_recipient: Recipient is not on WhatsApp (meta code 131026)",
      },
      { providerMessageId: "wamid.C", status: "other" },
    ]);
    expect(result.statuses[0]!.eventId).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(result.statuses.map((update) => update.eventId)).size).toBe(3);
    // The same status always gets the same event id, so Inngest drops a repeat.
    const again = harness.service.handleWebhookPost(payload, signatureOf(payload));
    expect(again.accepted && again.statuses[0]!.eventId).toBe(result.statuses[0]!.eventId);
  });

  it("answers the verify-token GET only when the token matches", () => {
    expect(
      harness.service.verifyWebhookSubscription({
        mode: "subscribe",
        verifyToken: testWebhookSecrets.verifyToken,
        challenge: "1158201444",
      }),
    ).toBe("1158201444");
    expect(
      harness.service.verifyWebhookSubscription({
        mode: "subscribe",
        verifyToken: "wrong-token",
        challenge: "1158201444",
      }),
    ).toBeNull();
    expect(
      harness.service.verifyWebhookSubscription({
        mode: "unsubscribe",
        verifyToken: testWebhookSecrets.verifyToken,
        challenge: "1158201444",
      }),
    ).toBeNull();
  });
});

describe("resend", () => {
  it("is refused while pending", async () => {
    const { notificationId } = await harness.service.enqueue(instruction());

    await expect(harness.service.resend({ notificationId })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  describe("after Meta accepted the run but no status webhook came", () => {
    async function ageSentAttempt(notificationId: string, hours: number) {
      await db
        .update(notificationAttemptsTable)
        .set({ createdAt: sql`now() - make_interval(hours => ${hours})` })
        .where(eq(notificationAttemptsTable.notificationId, notificationId));
      await db
        .update(notificationsTable)
        .set({ updatedAt: sql`now() - make_interval(hours => ${hours + 1})` })
        .where(eq(notificationsTable.id, notificationId));
    }

    it("is still refused 23 hours after the sent attempt", async () => {
      const notificationId = await sentNotification("wamid.STALE23");
      await ageSentAttempt(notificationId, 23);

      await expect(harness.service.resend({ notificationId })).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect((await notificationRow(notificationId)).status).toBe("pending");
    });

    it("is allowed 24 hours after the sent attempt, as a new run with a new key", async () => {
      const notificationId = await sentNotification("wamid.STALE24");
      await ageSentAttempt(notificationId, 24);
      const oldRunKey = await currentRunKey(notificationId);

      expect(await harness.service.resend({ notificationId })).toEqual({
        notificationId,
        status: "pending",
      });
      const newRunKey = await currentRunKey(notificationId);
      expect(newRunKey).not.toBe(oldRunKey);
      expect(harness.dispatcher.dispatched.at(-1)).toEqual({ notificationId, runKey: newRunKey });
      // The new run has no sent attempt yet, so it sends again.
      harness.provider.scriptSends({ ok: true, providerMessageId: "wamid.STALE24.NEW" });
      expect(await harness.service.sendAttempt(notificationId, firstTry)).toEqual({
        outcome: "sent",
        failureCategory: null,
      });
    });

    it("ignores the old attempt's late statuses before and after the new run sends", async () => {
      const notificationId = await sentNotification("wamid.STALE.OLD");
      await ageSentAttempt(notificationId, 25);
      await harness.service.resend({ notificationId });

      // Before the new run has an attempt, the old one is still the latest by number.
      expect(
        await harness.service.applyProviderStatus(status("wamid.STALE.OLD", "delivered")),
      ).toEqual({ applied: false, status: "pending" });
      harness.provider.scriptSends({ ok: true, providerMessageId: "wamid.STALE.NEW" });
      await harness.service.sendAttempt(notificationId, firstTry);
      expect(await harness.service.applyProviderStatus(status("wamid.STALE.OLD", "read"))).toEqual({
        applied: false,
        status: "pending",
      });
      expect((await notificationRow(notificationId)).status).toBe("pending");

      await harness.service.applyProviderStatus(status("wamid.STALE.NEW", "delivered"));
      expect((await notificationRow(notificationId)).status).toBe("delivered");
    });
  });

  it("works from failed, delivered and read, dispatching a new run", async () => {
    for (const [wamid, finalStatus] of [
      ["wamid.RF", "failed"],
      ["wamid.RD", "delivered"],
      ["wamid.RR", "read"],
    ] as const) {
      const notificationId = await sentNotification(wamid);
      await harness.service.applyProviderStatus(
        status(wamid, finalStatus, "unknown: x (meta code 1)"),
      );

      const result = await harness.service.resend({ notificationId });

      expect(result).toEqual({ notificationId, status: "pending" });
      expect(harness.dispatcher.dispatched.at(-1)).toEqual({
        notificationId,
        runKey: await currentRunKey(notificationId),
      });
    }
  });

  it("works from skipped with a new phone and clears the skip reason", async () => {
    const { notificationId } = await harness.service.enqueue(instruction({ to: null }));

    await harness.service.resend({ notificationId, to: "+919800000009" });

    expect(await notificationRow(notificationId)).toMatchObject({
      status: "pending",
      recipientPhone: "+919800000009",
      skipReason: null,
    });
    expect(harness.dispatcher.dispatched).toEqual([
      { notificationId, runKey: await currentRunKey(notificationId) },
    ]);
  });

  it("is refused from skipped with no phone given and no valid stored phone", async () => {
    const missing = await harness.service.enqueue(instruction({ to: null }));
    const invalid = await harness.service.enqueue(instruction({ to: "12345" }));

    await expect(
      harness.service.resend({ notificationId: missing.notificationId }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      harness.service.resend({ notificationId: invalid.notificationId }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      harness.service.resend({ notificationId: missing.notificationId, to: "98000" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("leaves the template version, values and attachment unchanged", async () => {
    const template = await buildNotificationTemplate({
      templateId: "motake_doc",
      documentType: "pdf",
    });
    harness.documentReader.put("documents/b.pdf");
    const notificationId = await sentNotification("wamid.SNAP", {
      templateId: "motake_doc",
      attachment: { key: "documents/b.pdf", type: "pdf", filename: "b.pdf" },
    });
    await harness.service.applyProviderStatus(status("wamid.SNAP", "delivered"));
    const before = await notificationRow(notificationId);

    await harness.service.resend({ notificationId, to: "+919800000002" });

    expect(await notificationRow(notificationId)).toMatchObject({
      notificationTemplateId: template.id,
      templateValues: before.templateValues,
      attachmentKey: "documents/b.pdf",
      attachmentType: "pdf",
      attachmentFilename: "b.pdf",
      recipientPhone: "+919800000002",
    });
  });

  it("is refused as template_superseded once a higher version exists, changing nothing", async () => {
    const notificationId = await sentNotification("wamid.SUP");
    await harness.service.applyProviderStatus(
      status("wamid.SUP", "failed", "unknown: x (meta code 1)"),
    );
    await buildNotificationTemplate({ templateId: "motake_bill", version: 2, verified: false });
    const before = await notificationRow(notificationId);
    const dispatchCount = harness.dispatcher.dispatched.length;

    await expect(
      harness.service.resend({ notificationId, to: "+919800000003" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      cause: { refusal: { reason: "template_superseded" } },
    });

    const after = await notificationRow(notificationId);
    expect(after).toMatchObject({ status: "failed", recipientPhone: before.recipientPhone });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(harness.dispatcher.dispatched).toHaveLength(dispatchCount);
  });

  it("is not blocked by a higher version in another language", async () => {
    const notificationId = await sentNotification("wamid.LANG");
    await harness.service.applyProviderStatus(status("wamid.LANG", "delivered"));
    await buildNotificationTemplate({ templateId: "motake_bill", language: "en", version: 2 });

    await expect(harness.service.resend({ notificationId })).resolves.toMatchObject({
      status: "pending",
    });
  });
});

describe("suppress", () => {
  it("skips a pending row before any sent attempt and is refused after", async () => {
    const early = await harness.service.enqueue(instruction());
    const lateId = await sentNotification("wamid.LATE");

    const suppressed = await harness.service.suppress({
      notificationId: early.notificationId,
      reason: "newer Bill MB-26-27-000124",
    });
    const tooLate = await harness.service.suppress({
      notificationId: lateId,
      reason: "newer Bill",
    });

    expect(suppressed).toEqual({ suppressed: true });
    expect(await notificationRow(early.notificationId)).toMatchObject({
      status: "skipped",
      skipReason: "superseded: newer Bill MB-26-27-000124",
    });
    expect(tooLate).toEqual({ suppressed: false, status: "pending" });
  });

  it("still suppresses after a failed transient attempt in the current run", async () => {
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends({
      ok: false,
      retriable: true,
      category: "provider_unavailable",
      code: 131016,
      message: "Service unavailable",
    });
    await harness.service.sendAttempt(notificationId, firstTry);

    expect(await harness.service.suppress({ notificationId, reason: "newer Bill" })).toEqual({
      suppressed: true,
    });
  });

  it("succeeds again after a resend until the new run gets a sent attempt", async () => {
    const notificationId = await sentNotification("wamid.S1");
    await harness.service.applyProviderStatus(status("wamid.S1", "delivered"));
    await harness.service.resend({ notificationId });

    expect(await harness.service.suppress({ notificationId, reason: "newer Bill" })).toEqual({
      suppressed: true,
    });

    await harness.service.resend({ notificationId });
    harness.provider.scriptSends({ ok: true, providerMessageId: "wamid.S2" });
    await harness.service.sendAttempt(notificationId, firstTry);
    expect(await harness.service.suppress({ notificationId, reason: "newer Bill" })).toEqual({
      suppressed: false,
      status: "pending",
    });
  });
});

describe("row lock wait", () => {
  // Holds the notification row lock the way a send does across R2 and Meta, until released.
  async function holdRowLock(notificationId: string) {
    let release!: () => void;
    let lockTaken!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const taken = new Promise<void>((resolve) => (lockTaken = resolve));
    const holder = db.transaction(async (transaction) => {
      await lockNotificationWithTemplate(notificationId, transaction);
      lockTaken();
      await released;
    });
    await taken;
    return async () => {
      release();
      await holder;
    };
  }

  it("answers suppress and resend with CONFLICT within seconds while a send holds the row", async () => {
    const pending = await harness.service.enqueue(instruction());
    const deliveredId = await sentNotification("wamid.LOCK");
    await harness.service.applyProviderStatus(status("wamid.LOCK", "delivered"));
    const releasePending = await holdRowLock(pending.notificationId);
    const releaseDelivered = await holdRowLock(deliveredId);
    const busy = { code: "CONFLICT", message: expect.stringContaining("being sent right now") };

    const startedAt = Date.now();
    await expect(
      harness.service.suppress({ notificationId: pending.notificationId, reason: "newer Bill" }),
    ).rejects.toMatchObject(busy);
    await expect(harness.service.resend({ notificationId: deliveredId })).rejects.toMatchObject(
      busy,
    );
    const waitedMs = Date.now() - startedAt;
    await releasePending();
    await releaseDelivered();

    expect(waitedMs).toBeLessThan(10_000);
    expect((await notificationRow(pending.notificationId)).status).toBe("pending");
    expect((await notificationRow(deliveredId)).status).toBe("delivered");
    // Once the send lets go, both go through.
    expect(
      await harness.service.suppress({ notificationId: pending.notificationId, reason: "x" }),
    ).toEqual({ suppressed: true });
    expect(await harness.service.resend({ notificationId: deliveredId })).toEqual({
      notificationId: deliveredId,
      status: "pending",
    });
  });
});

describe("run keys", () => {
  function dispatchedKeys(notificationId: string) {
    return harness.dispatcher.dispatched
      .filter((call) => call.notificationId === notificationId)
      .map((call) => call.runKey);
  }

  it("gives each run its own key across send, resend, suppress and resend", async () => {
    const notificationId = await sentNotification("wamid.K1");
    await harness.service.applyProviderStatus(status("wamid.K1", "delivered"));
    await harness.service.resend({ notificationId });
    await harness.service.suppress({ notificationId, reason: "newer Bill" });
    await harness.service.resend({ notificationId });

    const keys = dispatchedKeys(notificationId);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    expect(keys.at(-1)).toBe(await currentRunKey(notificationId));
  });

  it("gives the resend after a suppress of a never-sent row a new key", async () => {
    const { notificationId } = await harness.service.enqueue(instruction());
    await harness.service.suppress({ notificationId, reason: "newer Bill" });
    await harness.service.resend({ notificationId });

    const keys = dispatchedKeys(notificationId);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).toBe(await currentRunKey(notificationId));
  });
});

describe("status reads", () => {
  it("lists rows for several refs in one call, newest first, and nothing for unknown refs", async () => {
    const first = await harness.service.enqueue(instruction({ businessRef: "bill:A" }));
    const second = await harness.service.enqueue(instruction({ businessRef: "bill:B" }));
    const third = await harness.service.enqueue(
      instruction({ businessRef: "bill:A", kind: "cancellation" }),
    );
    await harness.service.enqueue(instruction({ businessRef: "bill:C" }));

    const rows = await harness.service.listByBusinessRefs({ businessRefs: ["bill:A", "bill:B"] });
    const none = await harness.service.listByBusinessRefs({ businessRefs: ["bill:unknown"] });

    expect(rows.map((row) => row.notificationId)).toEqual([
      third.notificationId,
      second.notificationId,
      first.notificationId,
    ]);
    expect(none).toEqual([]);
  });

  it("never exposes the provider id, the raw error or the phone", async () => {
    const notificationId = await sentNotification("wamid.SECRET");
    await harness.service.applyProviderStatus(
      status("wamid.SECRET", "failed", "opted_out_or_blocked: User blocked (meta code 131050)"),
    );

    const single = await harness.service.getStatus(notificationId);
    const [listed] = await harness.service.listByBusinessRefs({
      businessRefs: [single.businessRef],
    });

    for (const view of [single, listed!]) {
      expect(Object.keys(view).sort()).toEqual([
        "attemptCount",
        "businessRef",
        "createdAt",
        "failureCategory",
        "idempotencyKey",
        "kind",
        "lastAttemptAt",
        "notificationId",
        "skipReason",
        "status",
        "updatedAt",
      ]);
      expect(JSON.stringify(view)).not.toMatch(/wamid|919800000001|User blocked|131050/);
      expect(view).toMatchObject({
        status: "failed",
        attemptCount: 1,
        failureCategory: "opted_out_or_blocked",
      });
      expect(view.lastAttemptAt).toBeInstanceOf(Date);
    }
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    await expect(
      harness.service.getStatus("00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("recovery sweep", () => {
  async function age(notificationId: string, minutes: number) {
    await db
      .update(notificationsTable)
      .set({ updatedAt: sql`now() - make_interval(mins => ${minutes})` })
      .where(eq(notificationsTable.id, notificationId));
  }

  it("dispatches only pending runs with no attempt that are past the age threshold", async () => {
    harness.dispatcher.failDispatch = true;
    const lost = await harness.service.enqueue(instruction());
    const fresh = await harness.service.enqueue(instruction());
    const skipped = await harness.service.enqueue(instruction({ to: null }));
    harness.dispatcher.failDispatch = false;
    const inFlight = await harness.service.enqueue(instruction());
    await harness.service.sendAttempt(inFlight.notificationId, firstTry);
    for (const id of [lost.notificationId, skipped.notificationId, inFlight.notificationId]) {
      await age(id, 3);
    }
    // inFlight's attempt predates its aged updated_at here, so give it a current-run attempt again.
    await db
      .update(notificationAttemptsTable)
      .set({ createdAt: sql`now()` })
      .where(eq(notificationAttemptsTable.notificationId, inFlight.notificationId));
    harness.dispatcher.dispatched.length = 0;

    const recovered = await harness.service.recoverUnqueued();

    expect(recovered).toEqual([lost.notificationId]);
    expect(harness.dispatcher.dispatched).toEqual([
      { notificationId: lost.notificationId, runKey: await currentRunKey(lost.notificationId) },
    ]);
    expect(fresh.status).toBe("pending");
  });

  it("finds a resent row whose dispatch failed, with the resend's run key", async () => {
    const notificationId = await sentNotification("wamid.RS");
    await harness.service.applyProviderStatus(
      status("wamid.RS", "failed", "unknown: x (meta code 1)"),
    );
    harness.dispatcher.failDispatch = true;
    await harness.service.resend({ notificationId });
    harness.dispatcher.failDispatch = false;
    // Move the whole history back, keeping the old attempt before the resend.
    await db
      .update(notificationAttemptsTable)
      .set({ createdAt: sql`now() - interval '10 minutes'` })
      .where(eq(notificationAttemptsTable.notificationId, notificationId));
    await age(notificationId, 3);
    harness.dispatcher.dispatched.length = 0;

    const recovered = await harness.service.recoverUnqueued();

    expect(recovered).toEqual([notificationId]);
    expect(harness.dispatcher.dispatched).toEqual([
      { notificationId, runKey: await currentRunKey(notificationId) },
    ]);
  });
});

describe("health", () => {
  it("reports the database and Inngest", async () => {
    expect(await harness.service.health()).toEqual({
      status: "ok",
      database: "ok",
      inngest: "ok",
      // Not checked yet: the app syncs the token at start-up.
      whatsappToken: "unavailable",
    });
    harness.dispatcher.healthy = false;
    expect(await harness.service.health()).toEqual({
      status: "degraded",
      database: "ok",
      inngest: "down",
      whatsappToken: "unavailable",
    });
  });
});
