import http from "node:http";
import { logger } from "@repo/logger";
import { app as expressApplication } from "./server";

import { env } from "./env";

async function init() {
  try {
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
