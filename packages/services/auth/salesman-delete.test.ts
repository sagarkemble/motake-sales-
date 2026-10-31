import { softDeleteProfile } from "@repo/database/queries/auth";
import { describe, expect, it } from "vitest";

import { buildProfile, buildSalesman } from "../test/builders";
import AuthService, { deletedEmailFor } from "./index";

const authService = new AuthService();

describe("Deleted salesman", () => {
  it("frees the email as delete+{email}, numbering the copy when one is already taken", async () => {
    expect(await deletedEmailFor("ravi@example.com")).toBe("delete+ravi@example.com");

    await buildProfile({ email: "delete+sunil@example.com" });
    await buildProfile({ email: "DELETE+2+sunil@example.com" });

    expect(await deletedEmailFor("sunil@example.com")).toBe("delete+3+sunil@example.com");
  });

  it("cannot be reactivated", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    await softDeleteProfile(salesman.id);

    await expect(
      authService.reactivateSalesmanAccount(salesman.id, admin.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
