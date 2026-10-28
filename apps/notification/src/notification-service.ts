import NotificationService, {
  MetaWhatsAppProvider,
  R2DocumentReader,
  WhatsAppTokenStore,
} from "@repo/services/notification";

import { env } from "./env";
import { InngestDispatcher } from "./inngest";

// Both copies of the access token: the secret file the provider reads on every call, and Vault.
export const tokenStore = new WhatsAppTokenStore({
  secretFilePath: env.WHATSAPP_TOKEN_FILE,
  vaultSecretName: env.WHATSAPP_TOKEN_VAULT_SECRET_NAME,
});

// The one NotificationService this app serves, wired to Meta, the private R2 bucket and Inngest.
export const notificationService = new NotificationService({
  provider: new MetaWhatsAppProvider({
    tokenSource: tokenStore,
    phoneNumberId: env.META_PHONE_NUMBER_ID,
  }),
  documentReader: new R2DocumentReader({
    accountId: env.NOTIFICATION_R2_ACCOUNT_ID,
    accessKeyId: env.NOTIFICATION_R2_ACCESS_KEY_ID,
    secretAccessKey: env.NOTIFICATION_R2_SECRET_ACCESS_KEY,
    bucketName: env.R2_DOCUMENTS_BUCKET_NAME,
  }),
  dispatcher: new InngestDispatcher(),
  webhook: {
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
  },
  tokenStore,
});
