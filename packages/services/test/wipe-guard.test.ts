import { describe, expect, it } from "vitest";

import { assertDatabaseWipeAllowed, isTestDatabaseUrl } from "./database";

const LOCAL_URL = "postgres://supabase_admin:postgres@127.0.0.1:55432/motake_test";
const MOTAKE_TESTING_POOLER_URL =
  "postgresql://postgres.osugflntfiggupnstyfo:secret@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
const PRODUCTION_POOLER_URL =
  "postgresql://postgres.uxgqkmdeuorjdnafpprs:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

describe("database wipe guard", () => {
  it("refuses when ALLOW_DB_WIPE is not set", () => {
    expect(() => assertDatabaseWipeAllowed({ DATABASE_URL: LOCAL_URL })).toThrow(
      /ALLOW_DB_WIPE=true/,
    );
  });

  it("refuses when ALLOW_DB_WIPE is anything other than true", () => {
    expect(() =>
      assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "1", DATABASE_URL: LOCAL_URL }),
    ).toThrow(/ALLOW_DB_WIPE=true/);
  });

  it("allows a local Postgres when ALLOW_DB_WIPE is true", () => {
    expect(() =>
      assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "true", DATABASE_URL: LOCAL_URL }),
    ).not.toThrow();
  });

  it("refuses the production database even when ALLOW_DB_WIPE is true", () => {
    expect(() =>
      assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "true", DATABASE_URL: PRODUCTION_POOLER_URL }),
    ).toThrow(/not a local Postgres/);
  });

  it("refuses the motake-testing database, which keeps the click-testing data", () => {
    expect(() =>
      assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "true", DATABASE_URL: MOTAKE_TESTING_POOLER_URL }),
    ).toThrow(/not a local Postgres/);
  });

  it("refuses when DATABASE_URL is missing", () => {
    expect(() => assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "true" })).toThrow(
      /not a local Postgres/,
    );
  });
});

describe("isTestDatabaseUrl", () => {
  it("accepts local Postgres", () => {
    expect(isTestDatabaseUrl(LOCAL_URL)).toBe(true);
    expect(isTestDatabaseUrl("postgresql://postgres:postgres@localhost:5432/motake")).toBe(true);
    expect(isTestDatabaseUrl("postgres://supabase_admin:postgres@postgres:5432/motake_test")).toBe(
      true,
    );
  });

  it("rejects hosted Supabase projects, unknown hosts and garbage", () => {
    expect(isTestDatabaseUrl(PRODUCTION_POOLER_URL)).toBe(false);
    expect(isTestDatabaseUrl(MOTAKE_TESTING_POOLER_URL)).toBe(false);
    expect(
      isTestDatabaseUrl(
        "postgresql://postgres:secret@db.osugflntfiggupnstyfo.supabase.co:5432/postgres",
      ),
    ).toBe(false);
    expect(
      isTestDatabaseUrl(
        "postgresql://postgres:secret@db.acezfweshcpsgwskguvd.supabase.co:5432/postgres",
      ),
    ).toBe(false);
    expect(isTestDatabaseUrl("not a url")).toBe(false);
    expect(isTestDatabaseUrl(undefined)).toBe(false);
  });
});
