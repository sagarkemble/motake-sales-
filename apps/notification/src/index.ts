import http from "node:http";
import { logger } from "@repo/logger";
import { app as expressApplication } from "./server";

import { env } from "./env";
import { notificationService, tokenStore } from "./notification-service";

async function init() {
  try {
    // Spec J-0: fill or repair the secret file from Vault before serving. An empty file takes the
    // Vault token even when Meta is unreachable or refuses it (a refused token holds messages and
    // the Admin banner shows). With no token in either place the app still starts: sends hold as
    // token errors and the Admin saves the first token from the banner, which needs this app up.
    const tokenStatus = await notificationService.syncToken();
    if (!(await tokenStore.readWorkingToken())) {
      logger.error(
        `No WhatsApp access token in ${env.WHATSAPP_TOKEN_FILE} or the Vault secret ${env.WHATSAPP_TOKEN_VAULT_SECRET_NAME}; messages are held until an Admin saves one`,
      );
    }
    logger.info(`WhatsApp access token is ${tokenStatus.state}`, {
      heldCount: tokenStatus.heldCount,
    });

    const server = http.createServer(expressApplication);
    const PORT: number = env.PORT ? +env.PORT : 8100;
    server.listen(PORT, env.HOST, () => {
      logger.info(`notification http server is running on ${env.HOST}:${PORT}`);
    });
  } catch (err) {
    logger.error(`Error creating http server`, { err });
    process.exit(1);
  }
}

init();
