import NotificationService, {
  MetaWhatsAppProvider,
  R2DocumentReader,
} from "@repo/services/notification";

import { env } from "./env";
import { InngestDispatcher } from "./inngest";

// The one NotificationService this app serves, wired to Meta, the private R2 bucket and Inngest.
export const notificationService = new NotificationService({
  provider: new MetaWhatsAppProvider({
    accessToken: env.META_ACCESS_TOKEN,
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
});
