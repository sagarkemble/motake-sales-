import { describe, expect, it } from "vitest";

import { assertDatabaseWipeAllowed } from "./database";

describe("database wipe guard", () => {
  it("refuses when ALLOW_DB_WIPE is not set", () => {
    expect(() => assertDatabaseWipeAllowed({})).toThrow(/ALLOW_DB_WIPE=true/);
  });

  it("refuses when ALLOW_DB_WIPE is anything other than true", () => {
    expect(() => assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "1" })).toThrow(/ALLOW_DB_WIPE=true/);
  });

  it("allows when ALLOW_DB_WIPE is true", () => {
    expect(() => assertDatabaseWipeAllowed({ ALLOW_DB_WIPE: "true" })).not.toThrow();
  });
});
