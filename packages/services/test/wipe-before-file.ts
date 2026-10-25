import { beforeAll } from "vitest";

import { wipeApplicationTables } from "./database";

beforeAll(async () => {
  await wipeApplicationTables();
});
