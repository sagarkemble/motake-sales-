import { db, eq } from "@repo/database";
import { deleteVaultSecretByName } from "@repo/database/queries/vault";
import { auditLogsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { refusalOf } from "../errors";
import { WhatsAppTokenStore } from "../notification";
import { buildProfile } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import { FakeNotificationTokenGateway, FakeTokenChecker } from "../test/notification-fakes";
import WhatsAppTokenService from "./index";

// Spec J-0, the Admin side: real Vault (a test-only secret name) and audit log; the notification
// app (typed client) and Meta's token check are faked. Admin-only is the router's adminProcedure.
const TEST_VAULT_SECRET_NAME = "motake_whatsapp_access_token_admin_test";
const SAVED_TOKEN = "EAAGsavedTokenAbcdefghijklmnop1111";
const PASTED_TOKEN = "EAAGpastedTokenQrstuvwxyz0123459876";

let tokenStore: WhatsAppTokenStore;
let gateway: FakeNotificationTokenGateway;
let checker: FakeTokenChecker;
let service: WhatsAppTokenService;

beforeEach(async () => {
  await wipeApplicationTables();
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
  tokenStore = new WhatsAppTokenStore({ vaultSecretName: TEST_VAULT_SECRET_NAME });
  gateway = new FakeNotificationTokenGateway();
  checker = new FakeTokenChecker();
  checker.validTokens.add(PASTED_TOKEN);
  service = new WhatsAppTokenService({ notification: gateway, tokenChecker: checker, tokenStore });
});

afterEach(async () => {
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
});

async function tokenAuditRows() {
  return db.select().from(auditLogsTable).where(eq(auditLogsTable.entityType, "whatsapp_token"));
}

describe("status", () => {
  it("relays why messages are paused, how many wait and when one last went out, never the token", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });
    await tokenStore.saveVaultToken(SAVED_TOKEN, admin.id);
    const lastWorkedAt = new Date("2026-10-28T09:30:00Z");
    gateway.status = {
      state: "invalid",
      checkedAt: new Date("2026-10-28T10:00:00Z"),
      heldCount: 3,
      tokenHeldCount: 2,
      paymentHeldCount: 1,
      pausedReason: "token",
      lastWorkedAt,
    };

    const status = await service.status();

    expect(status).toEqual({ state: "invalid", pausedReason: "token", heldCount: 3, lastWorkedAt });
    expect(JSON.stringify(status)).not.toContain(SAVED_TOKEN);
  });

  it("relays a payment pause while the token works", async () => {
    gateway.status = {
      ...gateway.status,
      state: "ok",
      heldCount: 2,
      paymentHeldCount: 2,
      pausedReason: "payment",
    };

    expect(await service.status()).toMatchObject({
      state: "ok",
      pausedReason: "payment",
      heldCount: 2,
    });
  });

  it("is unknown and not paused while the notification app does not answer", async () => {
    gateway.down = true;

    expect(await service.status()).toEqual({
      state: "unknown",
      pausedReason: null,
      heldCount: null,
      lastWorkedAt: null,
    });
  });

  it("is unknown when no notification app is configured", async () => {
    const unconfigured = new WhatsAppTokenService({
      notification: null,
      tokenChecker: checker,
      tokenStore,
    });

    expect((await unconfigured.status()).state).toBe("unknown");
  });
});

describe("update", () => {
  it("refuses a token Meta rejects and keeps the saved one", async () => {
    const admin = await buildProfile();
    await tokenStore.saveVaultToken(SAVED_TOKEN, admin.id);

    const refused = await service
      .update({ token: "EAAGexpired0000" }, admin.id)
      .catch((error: unknown) => error);

    expect(refused).toMatchObject({ code: "BAD_REQUEST" });
    expect(refusalOf(refused)).toEqual({ reason: "token_invalid", details: null });
    expect(String((refused as Error).message)).not.toContain("EAAGexpired0000");
    expect(await tokenStore.readVaultToken()).toBe(SAVED_TOKEN);
    expect(await tokenAuditRows()).toEqual([]);
    expect(gateway.refreshCalls).toBe(0);
  });

  it("refuses while Meta cannot check the token and saves nothing", async () => {
    const admin = await buildProfile();
    checker.unavailable = true;

    const refused = await service.update({ token: PASTED_TOKEN }, admin.id).catch((e) => e);

    expect(refusalOf(refused)).toMatchObject({ reason: "token_check_unavailable" });
    expect(await tokenStore.readVaultToken()).toBeNull();
  });

  it("saves a working token to Vault, audits it without the token and refreshes the app", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });
    await tokenStore.saveVaultToken(SAVED_TOKEN, admin.id);

    const status = await service.update({ token: `  ${PASTED_TOKEN}\n` }, admin.id);

    expect(await tokenStore.readVaultToken()).toBe(PASTED_TOKEN);
    expect(gateway.refreshCalls).toBe(1);
    expect(status).toMatchObject({ state: "ok", pausedReason: null });
    expect(JSON.stringify(status)).not.toContain(PASTED_TOKEN);
    const auditRows = await tokenAuditRows();
    expect(auditRows).toMatchObject([
      {
        actorId: admin.id,
        action: "token_updated",
        entityType: "whatsapp_token",
        entityId: (await tokenStore.readVaultMetadata())!.secretId,
        payload: { last4: "9876" },
      },
    ]);
    expect(JSON.stringify(auditRows)).not.toContain(PASTED_TOKEN);
  });

  it("still saves to Vault while the notification app is down", async () => {
    const admin = await buildProfile();
    gateway.down = true;

    const status = await service.update({ token: PASTED_TOKEN }, admin.id);

    expect(await tokenStore.readVaultToken()).toBe(PASTED_TOKEN);
    expect(status).toMatchObject({ state: "unknown", pausedReason: null });
    expect(await tokenAuditRows()).toHaveLength(1);
  });
});

describe("sendWaiting", () => {
  it("relays how many held messages were queued", async () => {
    gateway.queued = 4;

    expect(await service.sendWaiting()).toEqual({ queued: 4 });
    expect(gateway.resumeCalls).toBe(1);
  });

  it("relays the refusal while the token is not working", async () => {
    gateway.refuseResume = true;

    const refused = await service.sendWaiting().catch((error: unknown) => error);

    expect(refused).toMatchObject({ code: "CONFLICT" });
    expect(refusalOf(refused)).toMatchObject({ reason: "token_not_working" });
  });

  it("is refused as notification_unavailable while the app does not answer", async () => {
    gateway.down = true;

    const refused = await service.sendWaiting().catch((error: unknown) => error);

    expect(refusalOf(refused)).toMatchObject({ reason: "notification_unavailable" });
  });
});
