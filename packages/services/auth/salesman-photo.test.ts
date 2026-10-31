import { describe, expect, it } from "vitest";

import { buildProfile, buildSalesman } from "../test/builders";
import AuthService from "./index";

const authService = new AuthService();

describe("Salesman photo set by the Admin", () => {
  it("saves a photo the Admin uploaded through the Admin's own avatar upload URL", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();
    const avatarKey = `avatars/${admin.id}/photo.jpg`;

    const updatedProfile = await authService.updateSalesmanAccount(
      salesman.id,
      { avatarKey },
      admin.id,
    );

    expect(updatedProfile.avatarKey).toBe(avatarKey);
    expect(updatedProfile.avatarUrl).toMatch(new RegExp(`/${avatarKey}$`));
  });

  it("refuses a photo that was not uploaded by this Admin", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman();

    await expect(
      authService.updateSalesmanAccount(
        salesman.id,
        { avatarKey: `avatars/${salesman.id}/photo.jpg` },
        admin.id,
      ),
    ).rejects.toMatchObject({ cause: { refusal: { reason: "photo_upload_invalid" } } });
  });
});
