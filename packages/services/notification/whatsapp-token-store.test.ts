import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { runInTransaction } from "@repo/database/queries/shared/executor";
import { deleteVaultSecretByName } from "@repo/database/queries/vault";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WhatsAppTokenStore } from "./index";

// Real Vault on the env database (a test-only secret name, deleted after each test) and a real
// secret file in a temp folder.
const TEST_VAULT_SECRET_NAME = "motake_whatsapp_access_token_store_test";

let directory: string;
let secretFilePath: string;
let store: WhatsAppTokenStore;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "motake-token-store-"));
  secretFilePath = path.join(directory, "whatsapp-access-token");
  store = new WhatsAppTokenStore({ secretFilePath, vaultSecretName: TEST_VAULT_SECRET_NAME });
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
});

afterEach(async () => {
  await deleteVaultSecretByName(TEST_VAULT_SECRET_NAME);
  await rm(directory, { recursive: true, force: true });
});

describe("working token (secret file)", () => {
  it("is null while the file is missing or blank", async () => {
    expect(await store.readWorkingToken()).toBeNull();

    await writeFile(secretFilePath, "  \n");

    expect(await store.readWorkingToken()).toBeNull();
  });

  it("reads the file trimmed and picks up a rewrite on the next read", async () => {
    await writeFile(secretFilePath, "EAAG-first-token\n");
    expect(await store.readWorkingToken()).toBe("EAAG-first-token");

    await writeFile(secretFilePath, "EAAG-second-token-longer");

    expect(await store.readWorkingToken()).toBe("EAAG-second-token-longer");
  });

  it("writes the file owner-only by atomic replace and reads it back", async () => {
    await writeFile(secretFilePath, "EAAG-old");
    expect(await store.readWorkingToken()).toBe("EAAG-old");

    await store.writeWorkingToken("EAAG-new-token");

    expect(await readFile(secretFilePath, "utf8")).toBe("EAAG-new-token\n");
    expect((await stat(secretFilePath)).mode & 0o777).toBe(0o600);
    expect(await store.readWorkingToken()).toBe("EAAG-new-token");
  });

  it("creates a missing folder owner-only on the first write", async () => {
    const nestedPath = path.join(directory, "secrets", "whatsapp-access-token");
    const nested = new WhatsAppTokenStore({
      secretFilePath: nestedPath,
      vaultSecretName: TEST_VAULT_SECRET_NAME,
    });

    await nested.writeWorkingToken("EAAG-nested");

    expect(await nested.readWorkingToken()).toBe("EAAG-nested");
    expect((await stat(path.dirname(nestedPath))).mode & 0o777).toBe(0o700);
  });

  it("refuses file access when no secret file is configured", async () => {
    const vaultOnly = new WhatsAppTokenStore({ vaultSecretName: TEST_VAULT_SECRET_NAME });

    await expect(vaultOnly.readWorkingToken()).rejects.toThrow(/secret file/);
    await expect(vaultOnly.writeWorkingToken("EAAG-x")).rejects.toThrow(/secret file/);
  });
});

describe("master token (Vault)", () => {
  it("is null and has no metadata before anything is saved", async () => {
    expect(await store.readVaultToken()).toBeNull();
    expect(await store.readVaultMetadata()).toBeNull();
  });

  it("creates the named secret once, then updates it, with last 4 and who saved it", async () => {
    const firstAdmin = "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e";
    const secondAdmin = "5d7c4b1a-2e3f-4a5b-8c9d-0e1f2a3b4c5d";

    const created = await store.saveVaultToken("EAAG-first-1234", firstAdmin);
    const updated = await store.saveVaultToken("EAAG-second-9876", secondAdmin);

    expect(updated.secretId).toBe(created.secretId);
    expect(await store.readVaultToken()).toBe("EAAG-second-9876");
    const metadata = await store.readVaultMetadata();
    expect(metadata).toEqual({
      secretId: created.secretId,
      last4: "9876",
      updatedAt: expect.any(Date),
      updatedBy: secondAdmin,
    });
    expect(metadata!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    expect(JSON.stringify(metadata)).not.toContain("EAAG");
  });

  it("keeps one secret when two saves race", async () => {
    const admin = "0b0f8f3e-7f43-4a8e-9d2c-1f6a1b2c3d4e";

    const results = await Promise.all([
      runInTransaction((transaction) => store.saveVaultToken("EAAG-race-aaaa", admin, transaction)),
      runInTransaction((transaction) => store.saveVaultToken("EAAG-race-bbbb", admin, transaction)),
    ]);

    expect(results[0]!.secretId).toBe(results[1]!.secretId);
    expect(["EAAG-race-aaaa", "EAAG-race-bbbb"]).toContain(await store.readVaultToken());
  });
});
