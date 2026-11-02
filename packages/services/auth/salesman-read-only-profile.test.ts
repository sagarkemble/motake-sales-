import { describe, expect, it } from "vitest";

import { buildProfile, buildSalesman } from "../test/builders";
import AuthService from "./index";

const authService = new AuthService();

describe("A salesman's own profile is read only", () => {
  it("refuses a salesman changing their own name", async () => {
    const { profile: salesman } = await buildSalesman({ name: "Ravi Kamble" });

    await expect(
      authService.updateMyProfile(salesman.id, { name: "Ravi K" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a salesman changing or removing their own photo", async () => {
    const { profile: salesman } = await buildSalesman();

    await expect(
      authService.createAvatarUploadUrl(salesman.id, {
        fileName: "photo.jpg",
        contentType: "image/jpeg",
        contentLength: 1024,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(authService.deleteMyAvatar(salesman.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("still lets the Admin change their own name", async () => {
    const admin = await buildProfile({ name: "Old Name" });

    const updatedProfile = await authService.updateMyProfile(admin.id, { name: "New Name" });

    expect(updatedProfile?.name).toBe("New Name");
  });
});
