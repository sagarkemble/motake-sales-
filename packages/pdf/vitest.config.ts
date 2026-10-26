import { defineConfig } from "vitest/config";

// Layout tests render each layout from fixed values and read back the printed text. No database.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
  },
});
