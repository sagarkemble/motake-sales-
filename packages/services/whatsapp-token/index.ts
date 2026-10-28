import { getProfileById } from "@repo/database/queries/auth";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { logger } from "@repo/logger";
import { z } from "zod";

import { env } from "../env";
import { errorMessageOf, refusalOf, whatsAppTokenRefused } from "../errors";
import {
  MetaWhatsAppProvider,
  WhatsAppTokenStore,
  type WhatsAppProvider,
  type WhatsAppTokenMetadata,
} from "../notification";
import { recordAudit } from "../shared/audit";
import {
  updateWhatsAppTokenInputSchema,
  type NotificationTokenGateway,
  type ResumeHeldResult,
  type UpdateWhatsAppTokenInput,
  type WhatsAppTokenSettings,
  type WhatsAppTokenStatus,
} from "./model";

export interface WhatsAppTokenServiceDependencies {
  // Null when the notification app is not configured (no NOTIFICATION_URL).
  notification?: NotificationTokenGateway | null;
  // Meta's read-only token check for a pasted token.
  tokenChecker?: Pick<WhatsAppProvider, "checkToken">;
  tokenStore?: WhatsAppTokenStore;
}

// The main API touches only the Vault copy; the notification app owns the secret file.
function defaultTokenStore(): WhatsAppTokenStore {
  return new WhatsAppTokenStore({ vaultSecretName: env.WHATSAPP_TOKEN_VAULT_SECRET_NAME });
}

// Checks a pasted token against the configured phone number. Without META_PHONE_NUMBER_ID no
// check can run, so every save is refused as token_check_unavailable.
function defaultTokenChecker(): Pick<WhatsAppProvider, "checkToken"> {
  const phoneNumberId = env.META_PHONE_NUMBER_ID;
  if (!phoneNumberId) return { checkToken: async () => "unavailable" };
  return new MetaWhatsAppProvider({
    tokenSource: { readWorkingToken: async () => null },
    phoneNumberId,
  });
}

// NOTIFICATION_URL and NOTIFICATION_INTERNAL_API_KEY for the typed notification client, or null
// while the main API runs without the notification app.
export function notificationClientConfig(): { baseUrl: string; internalApiKey: string } | null {
  if (!env.NOTIFICATION_URL || !env.NOTIFICATION_INTERNAL_API_KEY) return null;
  return { baseUrl: env.NOTIFICATION_URL, internalApiKey: env.NOTIFICATION_INTERNAL_API_KEY };
}

const notificationUnavailable = () =>
  whatsAppTokenRefused(
    "notification_unavailable",
    "The WhatsApp notification service is not answering. Try again in a minute.",
  );

// The Fix access token dialog from the Admin banner (Spec J-0): status, paste a new token, send held
// messages. Never returns, logs or audits the token; only its last 4 characters.
class WhatsAppTokenService {
  private readonly notification: NotificationTokenGateway | null;
  private readonly tokenChecker: Pick<WhatsAppProvider, "checkToken">;
  private readonly tokenStore: WhatsAppTokenStore;

  public constructor(dependencies: WhatsAppTokenServiceDependencies = {}) {
    this.notification = dependencies.notification ?? null;
    this.tokenChecker = dependencies.tokenChecker ?? defaultTokenChecker();
    this.tokenStore = dependencies.tokenStore ?? defaultTokenStore();
  }

  public async status(): Promise<WhatsAppTokenSettings> {
    const [remote, metadata] = await Promise.all([
      this.remoteStatus(),
      this.tokenStore.readVaultMetadata(),
    ]);
    return {
      state: remote?.state ?? "unknown",
      checkedAt: remote?.checkedAt ?? null,
      heldCount: remote?.heldCount ?? null,
      last4: metadata?.last4 ?? null,
      updatedAt: metadata?.updatedAt ?? null,
      updatedBy: await this.updatedByOf(metadata),
    };
  }

  // Checks the token with Meta first, so a wrong or expired token never replaces a working one.
  // Then Vault and the audit row commit together, and the notification app is told to pick it up.
  // Vault is saved even while the notification app is down: it picks the token up at its next
  // start or 5-minute check.
  public async update(
    input: UpdateWhatsAppTokenInput,
    actorId: string,
  ): Promise<WhatsAppTokenSettings> {
    const parsedInput = updateWhatsAppTokenInputSchema.parse(input);
    const check = await this.tokenChecker.checkToken(parsedInput.token);
    if (check === "auth_error") {
      throw whatsAppTokenRefused(
        "token_invalid",
        "Meta refused this access token. Check it was copied in full and has not expired or been revoked.",
      );
    }
    if (check !== "ok") {
      throw whatsAppTokenRefused(
        "token_check_unavailable",
        "Could not reach Meta to check this access token, so it was not saved. Try again in a minute.",
      );
    }

    await runInTransaction(async (transaction) => {
      const metadata = await this.tokenStore.saveVaultToken(
        parsedInput.token,
        actorId,
        transaction,
      );
      await recordAudit(
        {
          actorId,
          action: "token_updated",
          entityType: "whatsapp_token",
          entityId: metadata.secretId,
          payload: { last4: metadata.last4 },
        },
        transaction,
      );
    });

    if (this.notification) {
      try {
        await this.notification.refreshToken();
      } catch (error) {
        logger.error("Saved the WhatsApp token to Vault; the notification app did not refresh", {
          error: errorMessageOf(error),
        });
      }
    }
    return this.status();
  }

  public async sendWaiting(): Promise<ResumeHeldResult> {
    if (!this.notification) throw notificationUnavailable();
    try {
      return await this.notification.resumeHeld();
    } catch (error) {
      if (refusalOf(error)?.reason === "token_not_working") {
        throw whatsAppTokenRefused(
          "token_not_working",
          "WhatsApp messages are paused because the access token is not working. Save a working token first.",
        );
      }
      logger.error("Could not ask the notification app to send held messages", {
        error: errorMessageOf(error),
      });
      throw notificationUnavailable();
    }
  }

  private async remoteStatus(): Promise<WhatsAppTokenStatus | null> {
    if (!this.notification) return null;
    try {
      return await this.notification.tokenStatus();
    } catch (error) {
      logger.error("Could not read the WhatsApp token status from the notification app", {
        error: errorMessageOf(error),
      });
      return null;
    }
  }

  private async updatedByOf(
    metadata: WhatsAppTokenMetadata | null,
  ): Promise<WhatsAppTokenSettings["updatedBy"]> {
    // The description is plain text anyone with Vault access can edit; only a uuid is looked up.
    if (!metadata?.updatedBy || !z.uuid().safeParse(metadata.updatedBy).success) return null;
    const profile = await getProfileById(metadata.updatedBy);
    return { id: metadata.updatedBy, name: profile?.name ?? null };
  }
}

export default WhatsAppTokenService;
export { updateWhatsAppTokenInputSchema } from "./model";
export type {
  NotificationTokenGateway,
  ResumeHeldResult,
  UpdateWhatsAppTokenInput,
  WhatsAppTokenSettings,
  WhatsAppTokenSettingsState,
  WhatsAppTokenStatus,
} from "./model";
