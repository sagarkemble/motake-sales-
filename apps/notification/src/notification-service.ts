import NotificationService, {
  MetaWhatsAppProvider,
  ImageKitDocumentReader,
  WhatsAppTokenStore,
} from "@repo/services/notification";

import { env } from "./env";
import { InngestDispatcher } from "./inngest";

// Both copies of the access token: the secret file the provider reads on every call, and Vault.
export const tokenStore = new WhatsAppTokenStore({
  secretFilePath: env.WHATSAPP_TOKEN_FILE,
  vaultSecretName: env.WHATSAPP_TOKEN_VAULT_SECRET_NAME,
});

// The one NotificationService this app serves, wired to Meta, private ImageKit PDFs and Inngest.
export const notificationService = new NotificationService({
  provider: new MetaWhatsAppProvider({
    tokenSource: tokenStore,
    phoneNumberId: env.META_PHONE_NUMBER_ID,
  }),
  documentReader: new ImageKitDocumentReader({
    privateKey: env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
  }),
  dispatcher: new InngestDispatcher(),
  webhook: {
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
  },
  tokenStore,
});
