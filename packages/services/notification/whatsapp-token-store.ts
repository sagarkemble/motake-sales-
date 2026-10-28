import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "@repo/database";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import {
  createVaultSecret,
  getDecryptedVaultSecretByName,
  lockVaultSecretName,
  updateVaultSecret,
} from "@repo/database/queries/vault";

import type { WhatsAppTokenSource } from "./provider";

export interface WhatsAppTokenStoreConfig {
  // The Vault secret holding the master copy (db-decisions/0016).
  vaultSecretName: string;
  // The working copy on the notification server. Only the notification app sets it; the main API
  // touches Vault only.
  secretFilePath?: string | null;
}

// What the Fix access token dialog may show; never the token.
export interface WhatsAppTokenMetadata {
  secretId: string;
  last4: string;
  updatedAt: Date;
  // Profile id of the Admin who saved it; null when the secret was put in Vault by hand.
  updatedBy: string | null;
}

interface CachedWorkingToken {
  fileVersion: string;
  token: string | null;
}

const OWNER_ONLY_FILE_MODE = 0o600;
const OWNER_ONLY_DIRECTORY_MODE = 0o700;

function lastFourOf(token: string): string {
  return token.slice(-4);
}

function updatedByOf(description: string): string | null {
  try {
    const parsed = JSON.parse(description) as { updatedBy?: unknown };
    return typeof parsed.updatedBy === "string" ? parsed.updatedBy : null;
  } catch {
    return null;
  }
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}

// The two copies of the WhatsApp access token (Spec J-0): the master copy in Supabase Vault and
// the working copy in a secret file the Meta provider reads on every call. Never logs the token.
export class WhatsAppTokenStore implements WhatsAppTokenSource {
  private readonly vaultSecretName: string;
  private readonly secretFilePath: string | null;
  private cached: CachedWorkingToken | null = null;

  public constructor(config: WhatsAppTokenStoreConfig) {
    this.vaultSecretName = config.vaultSecretName;
    this.secretFilePath = config.secretFilePath ?? null;
  }

  // The secret file trimmed, or null while it is missing or blank. Re-read only when the file
  // changed (modified time, size or inode), so a rewrite is used on the very next call.
  public async readWorkingToken(): Promise<string | null> {
    const filePath = this.requireSecretFilePath();
    let fileVersion: string;
    try {
      const fileStat = await stat(filePath);
      fileVersion = `${fileStat.mtimeMs}:${fileStat.size}:${fileStat.ino}`;
    } catch (error) {
      if (isMissingFile(error)) {
        this.cached = null;
        return null;
      }
      throw error;
    }
    if (this.cached?.fileVersion === fileVersion) return this.cached.token;

    const token = (await readFile(filePath, "utf8")).trim() || null;
    this.cached = { fileVersion, token };
    return token;
  }

  // Atomic replace: a temp file in the same folder, owner-only, renamed over the secret file.
  public async writeWorkingToken(token: string): Promise<void> {
    const filePath = this.requireSecretFilePath();
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${randomUUID()}.tmp`,
    );
    await mkdir(path.dirname(filePath), { recursive: true, mode: OWNER_ONLY_DIRECTORY_MODE });
    try {
      await writeFile(temporaryPath, `${token.trim()}\n`, {
        mode: OWNER_ONLY_FILE_MODE,
        flag: "wx",
      });
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    this.cached = null;
  }

  public async readVaultToken(executor: DbExecutor = db): Promise<string | null> {
    const secret = await getDecryptedVaultSecretByName(this.vaultSecretName, executor);
    return secret?.secret.trim() || null;
  }

  // Creates the named secret or updates it. Pass the caller's transaction so the audit row commits
  // with it; the name lock holds until that transaction ends.
  public async saveVaultToken(
    token: string,
    updatedBy: string,
    executor: DbExecutor = db,
  ): Promise<WhatsAppTokenMetadata> {
    if (executor === db) {
      return runInTransaction((transaction) => this.saveVaultToken(token, updatedBy, transaction));
    }
    const trimmedToken = token.trim();
    const description = JSON.stringify({ updatedBy });
    await lockVaultSecretName(this.vaultSecretName, executor);
    const existing = await getDecryptedVaultSecretByName(this.vaultSecretName, executor);
    if (existing) {
      await updateVaultSecret({ id: existing.id, secret: trimmedToken, description }, executor);
    } else {
      await createVaultSecret(
        { name: this.vaultSecretName, secret: trimmedToken, description },
        executor,
      );
    }
    const metadata = await this.readVaultMetadata(executor);
    if (!metadata) throw new Error(`Vault secret ${this.vaultSecretName} was not saved`);
    return metadata;
  }

  public async readVaultMetadata(executor: DbExecutor = db): Promise<WhatsAppTokenMetadata | null> {
    const secret = await getDecryptedVaultSecretByName(this.vaultSecretName, executor);
    const token = secret?.secret.trim();
    if (!secret || !token) return null;
    return {
      secretId: secret.id,
      last4: lastFourOf(token),
      updatedAt: secret.updatedAt,
      updatedBy: updatedByOf(secret.description),
    };
  }

  private requireSecretFilePath(): string {
    if (!this.secretFilePath) {
      throw new Error("No WhatsApp token secret file is configured for this process");
    }
    return this.secretFilePath;
  }
}
