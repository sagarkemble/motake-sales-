import { db, eq } from "@repo/database";
import {
  notificationAttemptsTable,
  notificationsTable,
  notificationTemplatesTable,
} from "@repo/database/schema";
import { logger } from "@repo/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { wipeApplicationTables } from "../test/database";
import { buildNotificationTemplate } from "../test/builders";
import {
  buildNotificationHarness,
  currentRunKey,
  type NotificationHarness,
} from "../test/notification-fakes";
import type { EnqueueInput } from "./index";

let harness: NotificationHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  harness = buildNotificationHarness();
});

let keyCounter = 0;
function instruction(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  keyCounter += 1;
  return {
    idempotencyKey: `bill:${keyCounter}:v1`,
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

async function notificationRows() {
  return db.select().from(notificationsTable);
}

async function expectRefused(input: EnqueueInput, reason: string) {
  await expect(harness.service.enqueue(input)).rejects.toMatchObject({
    code: "BAD_REQUEST",
    cause: { refusal: { reason } },
  });
}

describe("enqueue", () => {
  it("saves a pending row and dispatches it once", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });

    const result = await harness.service.enqueue(instruction());

    expect(result).toMatchObject({ status: "pending", skipReason: null, created: true });
    expect(await notificationRows()).toHaveLength(1);
    expect(harness.dispatcher.dispatched).toEqual([
      {
        notificationId: result.notificationId,
        runKey: await currentRunKey(result.notificationId),
      },
    ]);
  });

  it("returns the same id for the same key with one row and no second dispatch", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const input = instruction();

    const first = await harness.service.enqueue(input);
    await harness.service.sendAttempt(first.notificationId, { tryIndex: 0, isFinalTry: false });
    const second = await harness.service.enqueue(input);

    expect(second).toEqual({
      notificationId: first.notificationId,
      status: "pending",
      skipReason: null,
      created: false,
    });
    expect(await notificationRows()).toHaveLength(1);
    expect(harness.dispatcher.dispatched).toHaveLength(1);
  });

  it("dispatches a replay again with the same run key while the row has no attempt", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    const input = instruction();

    const first = await harness.service.enqueue(input);
    const replay = await harness.service.enqueue(input);

    expect(replay.created).toBe(false);
    expect(replay.notificationId).toBe(first.notificationId);
    const runKey = await currentRunKey(first.notificationId);
    expect(harness.dispatcher.dispatched.map((call) => call.runKey)).toEqual([runKey, runKey]);
  });

  it("treats a replay with the same values in another key order as the same instruction", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    // jsonb hands keys back shortest first, so this order differs from the saved one.
    const input = instruction({
      values: { bill_number: "MB-26-27-000123", shop_name: "Shree Dairy" },
    });
    await harness.service.enqueue(input);
    const errorLog = vi.spyOn(logger, "error");

    try {
      await harness.service.enqueue(input);
      await harness.service.enqueue({ ...input, values: { ...input.values, shop_name: "Other" } });

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0]![0]).toContain("differs");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("still returns the id when dispatch fails, leaving the row for the sweep", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
    harness.dispatcher.failDispatch = true;

    const result = await harness.service.enqueue(instruction());

    expect(result).toMatchObject({ status: "pending", created: true });
    expect(await notificationRows()).toHaveLength(1);
  });

  it("stores the caller's skip reason when the phone is null", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });

    const result = await harness.service.enqueue(
      instruction({ to: null, skipReason: "not a valid Indian mobile" }),
    );

    expect(result).toMatchObject({
      status: "skipped",
      skipReason: "not a valid Indian mobile",
      created: true,
    });
  });

  it("skips a missing or malformed phone with a reason, no dispatch and no attempt", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });

    const missing = await harness.service.enqueue(instruction({ to: null }));
    const malformed = await harness.service.enqueue(instruction({ to: "9800000001" }));
    const tooShort = await harness.service.enqueue(instruction({ to: "+9198" }));
    const tooLong = await harness.service.enqueue(instruction({ to: `+${"9".repeat(25)}` }));

    expect(missing).toMatchObject({ status: "skipped", skipReason: "missing phone" });
    expect(malformed).toMatchObject({ status: "skipped", skipReason: "invalid phone" });
    expect(tooShort).toMatchObject({ status: "skipped", skipReason: "invalid phone" });
    expect(tooLong).toMatchObject({ status: "skipped", skipReason: "invalid phone" });
    expect(harness.dispatcher.dispatched).toEqual([]);
    expect(await db.select().from(notificationAttemptsTable)).toEqual([]);
    expect(harness.provider.sends).toEqual([]);
  });

  it("stores the template version, values and attachment, with a null body text", async () => {
    const template = await buildNotificationTemplate({
      templateId: "motake_bill",
      documentType: "pdf",
    });
    const attachment = {
      key: "documents/bills/MB-26-27-000123.pdf",
      type: "pdf" as const,
      filename: "Motake Bill MB-26-27-000123.pdf",
    };

    const sent = await harness.service.enqueue(instruction({ attachment }));
    const skipped = await harness.service.enqueue(instruction({ to: null, attachment }));

    for (const result of [sent, skipped]) {
      const [row] = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.id, result.notificationId));
      expect(row).toMatchObject({
        notificationTemplateId: template.id,
        templateValues: { shop_name: "Shree Dairy", bill_number: "MB-26-27-000123" },
        attachmentKey: attachment.key,
        attachmentType: "pdf",
        attachmentFilename: attachment.filename,
        bodyText: null,
      });
    }
  });

  it("stores all three attachment columns as null without an attachment", async () => {
    await buildNotificationTemplate({ templateId: "motake_receipt" });

    await harness.service.enqueue(instruction({ templateId: "motake_receipt", kind: "receipt" }));

    expect((await notificationRows())[0]).toMatchObject({
      attachmentKey: null,
      attachmentType: null,
      attachmentFilename: null,
      bodyText: null,
    });
  });
});

describe("enqueue template resolution", () => {
  it("uses the highest version and stores its id", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", version: 1 });
    const latest = await buildNotificationTemplate({ templateId: "motake_bill", version: 2 });

    await harness.service.enqueue(instruction());

    expect((await notificationRows())[0]!.notificationTemplateId).toBe(latest.id);
  });

  it("refuses an unverified highest version even when an older one is verified", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", version: 1, verified: true });
    await buildNotificationTemplate({ templateId: "motake_bill", version: 2, verified: false });

    await expectRefused(instruction(), "template_not_verified");
  });

  it("refuses a template that exists only in another language", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", language: "en" });

    await expectRefused(instruction({ language: "mr" }), "template_not_found");
  });

  it("refuses provider sms", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", provider: "sms" });

    await expectRefused(instruction({ provider: "sms" }), "provider_not_supported");
  });

  it("refuses values that do not match the template", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });

    await expectRefused(
      instruction({ values: { shop_name: "Shree Dairy" } }),
      "template_values_mismatch",
    );
    await expectRefused(
      instruction({ values: { shop_name: "A", bill_number: "B", extra: "C" } }),
      "template_values_mismatch",
    );
    await expectRefused(
      instruction({ values: { shop_name: "", bill_number: "B" } }),
      "template_values_mismatch",
    );
    await expectRefused(
      instruction({ values: { shop_name: "Shree\nDairy", bill_number: "B" } }),
      "template_values_mismatch",
    );
    await expectRefused(
      instruction({ values: { shop_name: "Shree\tDairy", bill_number: "B" } }),
      "template_values_mismatch",
    );
    await expectRefused(
      instruction({ values: { shop_name: "Shree     Dairy", bill_number: "B" } }),
      "template_values_mismatch",
    );
  });

  it("refuses an attachment that does not match the template's document type", async () => {
    await buildNotificationTemplate({ templateId: "pdf_template", documentType: "pdf" });
    await buildNotificationTemplate({ templateId: "plain_template", documentType: "none" });
    await buildNotificationTemplate({ templateId: "image_template", documentType: "image" });
    const pdf = { key: "documents/x.pdf", type: "pdf" as const, filename: "x.pdf" };

    await expectRefused(instruction({ templateId: "pdf_template" }), "attachment_mismatch");
    await expectRefused(
      instruction({ templateId: "plain_template", attachment: pdf }),
      "attachment_mismatch",
    );
    await expectRefused(
      instruction({ templateId: "image_template", attachment: pdf }),
      "attachment_mismatch",
    );
  });

  it("saves nothing on a refusal, including for a skipped phone", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", verified: false });

    await expectRefused(instruction(), "template_not_verified");
    await expectRefused(instruction({ to: null }), "template_not_verified");
    await expectRefused(instruction({ templateId: "unknown_template" }), "template_not_found");

    expect(await notificationRows()).toEqual([]);
    expect(harness.dispatcher.dispatched).toEqual([]);
  });

  it("does not refuse a replay of a saved key after its template is superseded", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", version: 1 });
    const input = instruction();
    const first = await harness.service.enqueue(input);
    await buildNotificationTemplate({ templateId: "motake_bill", version: 2, verified: false });

    const replay = await harness.service.enqueue(input);

    expect(replay).toMatchObject({ notificationId: first.notificationId, created: false });
  });

  it("refuses shape errors before anything is saved", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });

    await expect(
      harness.service.enqueue({ ...instruction(), kind: "invoice" as never }),
    ).rejects.toThrow();
    await expect(
      harness.service.enqueue({ ...instruction(), idempotencyKey: "k".repeat(129) }),
    ).rejects.toThrow();
    await expect(
      harness.service.enqueue({ ...instruction(), values: { shop_name: 1 } as never }),
    ).rejects.toThrow();
    expect(await notificationRows()).toEqual([]);
  });
});

describe("template reads", () => {
  it("lists templates filtered and ordered by template, language, then version descending", async () => {
    const billMrV1 = await buildNotificationTemplate({
      templateId: "b_bill",
      language: "mr",
      version: 1,
    });
    const billMrV2 = await buildNotificationTemplate({
      templateId: "b_bill",
      language: "mr",
      version: 2,
    });
    const billEn = await buildNotificationTemplate({
      templateId: "b_bill",
      language: "en",
      version: 1,
    });
    const receipt = await buildNotificationTemplate({ templateId: "a_receipt", language: "mr" });
    await buildNotificationTemplate({ templateId: "b_bill", provider: "sms", language: "mr" });

    const all = await harness.service.listTemplates({ provider: "whatsapp" });
    const bills = await harness.service.listTemplates({
      provider: "whatsapp",
      templateId: "b_bill",
      language: "mr",
    });

    // Languages sort in the enum's order: mr, hi, en.
    expect(all.map((template) => template.id)).toEqual([
      receipt.id,
      billMrV2.id,
      billMrV1.id,
      billEn.id,
    ]);
    expect(bills.map((template) => template.id)).toEqual([billMrV2.id, billMrV1.id]);
    expect(bills[0]).toMatchObject({
      provider: "whatsapp",
      templateId: "b_bill",
      language: "mr",
      version: 2,
      templateVariables: ["shop_name", "bill_number"],
      documentType: "none",
      verified: true,
    });
  });

  it("resolves the highest version with its verified flag, and NOT_FOUND when there is none", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill", version: 1 });
    const unverified = await buildNotificationTemplate({
      templateId: "motake_bill",
      version: 2,
      verified: false,
    });

    const resolved = await harness.service.resolveTemplate({
      provider: "whatsapp",
      templateId: "motake_bill",
      language: "mr",
    });

    expect(resolved).toMatchObject({ id: unverified.id, version: 2, verified: false });
    await expect(
      harness.service.resolveTemplate({
        provider: "whatsapp",
        templateId: "motake_bill",
        language: "en",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(notificationTemplatesTable)).toHaveLength(2);
  });
});
