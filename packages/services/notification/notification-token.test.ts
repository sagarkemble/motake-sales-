import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asc, db, eq } from "@repo/database";
import { deleteVaultSecretByName } from "@repo/database/queries/vault";
import { notificationAttemptsTable, notificationsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { refusalOf } from "../errors";
import { buildNotificationTemplate } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import {
  buildNotificationHarness,
  currentRunKey,
  type NotificationHarness,
} from "../test/notification-fakes";
import { WhatsAppTokenStore, type EnqueueInput, type ProviderFailure } from "./index";

// Spec J-0: a token error holds the message; a sync puts a working token in the secret file; a
// working token resumes held messages. Real Vault (a test-only secret name) and a real temp file.
const TEST_VAULT_SECRET_NAME = "motake_whatsapp_access_token_engine_test";
const WORKING_TOKEN = "EAAG-working-token-1111";
const EXPIRED_TOKEN = "EAAG-expired-token-2222";
const NEW_TOKEN = "EAAG-new-token-3333";

const firstTry = { tryIndex: 0, isFinalTry: false };
const middleTry = { tryIndex: 2, isFinalTry: false };
const finalTry = { tryIndex: 5, isFinalTry: true };
const billKey = "documents/bills/MB-26-27-000777.pdf";

let directory: string;
let secretFilePath: string;
let tokenStore: WhatsAppTokenStore;
let harness: NotificationHarness;

function buildHarness(tokenSyncDelayMs?: number): NotificationHarness {
  const built = buildNotificationHarness({ tokenStore, tokenSyncDelayMs });
  built.provider.validTokens.clear();
  built.provider.validTokens.add(WORKING_TOKEN);
  built.provider.validTokens.add(NEW_TOKEN);
  return built;
}

beforeEach(async () => {
  await wipeApplicationTables();
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
  directory = await mkdtemp(path.join(tmpdir(), "motake-token-engine-"));
  secretFilePath = path.join(directory, "whatsapp-access-token");
  tokenStore = new WhatsAppTokenStore({ secretFilePath, vaultSecretName: TEST_VAULT_SECRET_NAME });
  harness = buildHarness();
});

afterEach(async () => {
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
  await rm(directory, { recursive: true, force: true });
});

let keyCounter = 0;
function instruction(overrides: Partial<EnqueueInput> = {}): EnqueueInput {
  keyCounter += 1;
  return {
    idempotencyKey: `token:${keyCounter}`,
    kind: "bill",
    to: "+919800000001",
    provider: "whatsapp",
    templateId: "motake_bill",
    language: "mr",
    values: { bill_number: "MB-26-27-000777", shop_name: "Shree Dairy" },
    businessRef: `bill:token:${keyCounter}`,
    ...overrides,
  };
}

const authError: ProviderFailure = {
  ok: false,
  retriable: false,
  category: "auth_error",
  code: 190,
  message: "Error validating access token: Session has expired",
};

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

// A plain Bill whose send hit a token error on its first try.
async function heldBill(): Promise<string> {
  const { notificationId } = await harness.service.enqueue(instruction());
  harness.provider.scriptSends(authError);
  const result = await harness.service.sendAttempt(notificationId, firstTry);
  expect(result.outcome).toBe("held");
  return notificationId;
}

async function waitFor(condition: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Condition never became true");
}

describe("hold on a token error", () => {
  beforeEach(async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
  });

  it.each([
    ["a middle try", middleTry],
    ["the last try", finalTry],
  ])("keeps the row pending with one auth_error attempt on %s", async (_label, options) => {
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends(authError);

    const result = await harness.service.sendAttempt(notificationId, options);

    expect(result).toEqual({ outcome: "held", failureCategory: "auth_error" });
    expect((await notificationRow(notificationId)).status).toBe("pending");
    const attempts = await attemptRows(notificationId);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ status: "failed" });
    expect(attempts[0]!.error).toMatch(/^auth_error: /);
    expect(JSON.stringify(attempts)).not.toContain(WORKING_TOKEN);
  });

  it("holds a token error during media upload and sends nothing", async () => {
    await buildNotificationTemplate({ templateId: "motake_bill_pdf", documentType: "pdf" });
    harness.documentReader.put(billKey);
    const { notificationId } = await harness.service.enqueue(
      instruction({
        templateId: "motake_bill_pdf",
        attachment: { key: billKey, type: "pdf", filename: "Motake Bill.pdf" },
      }),
    );
    harness.provider.scriptUploads(authError);

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result.outcome).toBe("held");
    expect(harness.provider.sends).toHaveLength(0);
    expect((await notificationRow(notificationId)).status).toBe("pending");
    expect(await attemptRows(notificationId)).toHaveLength(1);
  });

  it("still fails other terminal errors at once", async () => {
    const { notificationId } = await harness.service.enqueue(instruction());
    harness.provider.scriptSends({
      ok: false,
      retriable: false,
      category: "invalid_recipient",
      code: 131026,
      message: "Message undeliverable",
    });

    const result = await harness.service.sendAttempt(notificationId, firstTry);

    expect(result.outcome).toBe("terminal");
    expect((await notificationRow(notificationId)).status).toBe("failed");
  });

  it("refuses resend while held and counts it in the token status", async () => {
    const notificationId = await heldBill();
    await heldBill();

    const refused = await harness.service.resend({ notificationId }).catch((error) => error);

    expect(refused).toMatchObject({ code: "CONFLICT" });
    expect((await harness.service.tokenStatus()).heldCount).toBe(2);
    expect((await harness.service.getStatus(notificationId)).status).toBe("pending");
  });
});

describe("syncToken", () => {
  it("keeps a working file token and never touches the file when Vault holds the same token", async () => {
    await writeFile(secretFilePath, `${WORKING_TOKEN}\n`);
    await tokenStore.saveVaultToken(WORKING_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    const status = await harness.service.syncToken();

    expect(status).toMatchObject({ state: "ok", checkedAt: expect.any(Date), heldCount: 0 });
    expect(await readFile(secretFilePath, "utf8")).toBe(`${WORKING_TOKEN}\n`);
  });

  it("writes a rotated Vault token over a file token that still works (Vault is the master)", async () => {
    await writeFile(secretFilePath, `${WORKING_TOKEN}\n`);
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    const status = await harness.service.syncToken();

    expect(status.state).toBe("ok");
    expect(await tokenStore.readWorkingToken()).toBe(NEW_TOKEN);
  });

  it("keeps a working file token when the Vault token is refused", async () => {
    await writeFile(secretFilePath, `${WORKING_TOKEN}\n`);
    await tokenStore.saveVaultToken(EXPIRED_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    const status = await harness.service.syncToken();

    expect(status.state).toBe("ok");
    expect(await readFile(secretFilePath, "utf8")).toBe(`${WORKING_TOKEN}\n`);
  });

  it("replaces an invalid file token with a different working Vault token", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    const status = await harness.service.syncToken();

    expect(status.state).toBe("ok");
    expect(await tokenStore.readWorkingToken()).toBe(NEW_TOKEN);
  });

  it("fills a missing secret file from Vault", async () => {
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    expect((await harness.service.syncToken()).state).toBe("ok");
    expect(await tokenStore.readWorkingToken()).toBe(NEW_TOKEN);
  });

  it("fills a missing secret file from Vault while Meta cannot answer, so start-up can go on", async () => {
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");
    harness.provider.tokenCheckUnavailable = true;

    expect((await harness.service.syncToken()).state).toBe("unavailable");
    expect(await tokenStore.readWorkingToken()).toBe(NEW_TOKEN);
  });

  it("fills a blank secret file with a refused Vault token and reports it invalid", async () => {
    await writeFile(secretFilePath, "\n");
    await tokenStore.saveVaultToken(EXPIRED_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    expect((await harness.service.syncToken()).state).toBe("invalid");
    expect(await tokenStore.readWorkingToken()).toBe(EXPIRED_TOKEN);
  });

  it("is invalid and leaves the file alone when both tokens are refused", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await tokenStore.saveVaultToken(
      "EAAG-also-expired-4444",
      "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e",
    );

    const status = await harness.service.syncToken();

    expect(status.state).toBe("invalid");
    expect(await readFile(secretFilePath, "utf8")).toBe(EXPIRED_TOKEN);
    expect((await harness.service.health()).whatsappToken).toBe("invalid");
  });

  it("is invalid when Vault holds the same refused token", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await tokenStore.saveVaultToken(EXPIRED_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");

    expect((await harness.service.syncToken()).state).toBe("invalid");
  });

  it("is unavailable and leaves the file alone while Meta cannot answer", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");
    harness.provider.tokenCheckUnavailable = true;

    expect((await harness.service.syncToken()).state).toBe("unavailable");
    expect(await readFile(secretFilePath, "utf8")).toBe(EXPIRED_TOKEN);
  });
});

describe("resumeHeld", () => {
  beforeEach(async () => {
    await buildNotificationTemplate({ templateId: "motake_bill" });
  });

  it("queues nothing and is refused while the token is not working", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await heldBill();
    await harness.service.syncToken();
    const dispatchedBefore = harness.dispatcher.dispatched.length;

    const refused = await harness.service.resumeHeld().catch((error) => error);

    expect(refusalOf(refused)).toMatchObject({ reason: "token_not_working" });
    expect(harness.dispatcher.dispatched).toHaveLength(dispatchedBefore);
    expect((await harness.service.tokenStatus()).heldCount).toBe(1);
  });

  it("starts a new run for each held row, dispatches it once, and keeps the held attempt", async () => {
    await writeFile(secretFilePath, WORKING_TOKEN);
    await harness.service.syncToken();
    const first = await heldBill();
    const second = await heldBill();
    const heldRunKeys = [await currentRunKey(first), await currentRunKey(second)];
    harness.dispatcher.dispatched.length = 0;

    const result = await harness.service.resumeHeld();

    expect(result).toEqual({ queued: 2 });
    expect(harness.dispatcher.dispatched).toEqual([
      { notificationId: first, runKey: await currentRunKey(first) },
      { notificationId: second, runKey: await currentRunKey(second) },
    ]);
    expect(harness.dispatcher.dispatched.map((entry) => entry.runKey)).not.toContain(
      heldRunKeys[0],
    );
    expect((await harness.service.tokenStatus()).heldCount).toBe(0);
    expect(await harness.service.resumeHeld()).toEqual({ queued: 0 });

    await harness.service.sendAttempt(first, firstTry);
    expect(await attemptRows(first)).toMatchObject([
      { attemptNumber: 1, status: "failed" },
      { attemptNumber: 2, status: "sent" },
    ]);
  });

  it("skips a held row that was suppressed meanwhile", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    const suppressedId = await heldBill();
    const keptId = await heldBill();
    await harness.service.syncToken();
    await harness.service.suppress({ notificationId: suppressedId, reason: "newer Bill version" });
    await writeFile(secretFilePath, WORKING_TOKEN);
    harness.dispatcher.dispatched.length = 0;

    await harness.service.syncToken();

    expect(harness.dispatcher.dispatched.map((entry) => entry.notificationId)).toEqual([keptId]);
    expect((await notificationRow(suppressedId)).status).toBe("skipped");
  });

  it("resumes held rows when a sync pulls a working token from Vault", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    const notificationId = await heldBill();
    await harness.service.syncToken();
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");
    harness.dispatcher.dispatched.length = 0;

    const status = await harness.service.syncToken();

    expect(status).toMatchObject({ state: "ok", heldCount: 0 });
    expect(harness.dispatcher.dispatched).toEqual([
      { notificationId, runKey: await currentRunKey(notificationId) },
    ]);
  });
});

describe("sync after a held send", () => {
  beforeEach(async () => {
    harness = buildHarness(10);
    await buildNotificationTemplate({ templateId: "motake_bill" });
  });

  it("checks the token shortly after a token error, pulls the Vault token in and resumes", async () => {
    await writeFile(secretFilePath, EXPIRED_TOKEN);
    await tokenStore.saveVaultToken(NEW_TOKEN, "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e");
    expect((await harness.service.tokenStatus()).checkedAt).toBeNull();

    const notificationId = await heldBill();
    await waitFor(async () => (await harness.service.tokenStatus()).heldCount === 0);

    expect(await tokenStore.readWorkingToken()).toBe(NEW_TOKEN);
    expect((await harness.service.tokenStatus()).state).toBe("ok");
    expect(harness.dispatcher.dispatched.at(-1)).toEqual({
      notificationId,
      runKey: await currentRunKey(notificationId),
    });
  });

  it("does not resume by itself when the token still checks ok, so it cannot loop", async () => {
    await writeFile(secretFilePath, WORKING_TOKEN);

    await heldBill();
    await waitFor(async () => (await harness.service.tokenStatus()).checkedAt !== null);

    expect(await harness.service.tokenStatus()).toMatchObject({ state: "ok", heldCount: 1 });
    // The 5-minute sync (or Send waiting messages) resumes it.
    expect((await harness.service.syncToken()).heldCount).toBe(0);
  });
});
