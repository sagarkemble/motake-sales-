import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "./env";

let databaseInstance: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (!databaseInstance) databaseInstance = drizzle(env.DATABASE_URL);
  return databaseInstance;
}

export const db = getDb();
export * from "drizzle-orm";
export default db;
