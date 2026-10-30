import { defineConfig } from "vitest/config";

// DATABASE_URL comes from the environment only: `pnpm test:local` or CI point it at a throwaway
// local Postgres. No env file is read, so the motake-testing and production data are never wiped.

const VAULT_TEST_FILES = [
  "whatsapp-token/whatsapp-token.test.ts",
  "notification/notification-token.test.ts",
  "notification/whatsapp-token-store.test.ts",
];

// Tests call the domain service classes against the real Postgres at DATABASE_URL. Files run one
// at a time because each file wipes every application table first.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    // `pnpm test:local` runs on plain Postgres, which has no Supabase Vault for the WhatsApp token.
    exclude: [
      "**/node_modules/**",
      ...(process.env.SKIP_VAULT_TESTS === "true" ? VAULT_TEST_FILES : []),
    ],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/wipe-before-file.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Tests never call Supabase, R2 or sign JWTs; these only satisfy the services env schema.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-only-jwt-secret",
      SUPABASE_URL: "https://test-placeholder.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-placeholder",
      R2_ACCOUNT_ID: "test-placeholder",
      R2_ACCESS_KEY_ID: "test-placeholder",
      R2_SECRET_ACCESS_KEY: "test-placeholder",
      R2_BUCKET_NAME: "test-placeholder",
      R2_PUBLIC_BASE_URL: "https://test-placeholder.example.com",
      R2_DOCUMENTS_BUCKET_NAME: "test-placeholder",
    },
  },
});
