import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { describe, expect, it } from "vitest";

import { buildProfile } from "../test/builders";
import CityService from "./index";

const cityService = new CityService();

describe("CityService", () => {
  it("adds a city under its state, trimmed, and records who added it", async () => {
    const admin = await buildProfile();

    const city = await cityService.createCity(
      { name: "  Ichalkaranji   East ", state: "Maharashtra" },
      admin.id,
    );

    expect(city).toMatchObject({
      name: "Ichalkaranji East",
      state: "Maharashtra",
      createdBy: admin.id,
    });
    const [row] = await listAuditLogsForEntity("city", city.id);
    expect(row).toMatchObject({
      action: "created",
      actorId: admin.id,
      payload: { name: "Ichalkaranji East", state: "Maharashtra" },
    });
  });

  it("refuses the same name in the same state in any letter case, but not in another state", async () => {
    const admin = await buildProfile();
    await cityService.createCity({ name: "Belgaum", state: "Karnataka" }, admin.id);

    await expect(
      cityService.createCity({ name: "BELGAUM", state: "Karnataka" }, admin.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      cityService.createCity({ name: "Belgaum", state: "Maharashtra" }, admin.id),
    ).resolves.toMatchObject({ state: "Maharashtra" });
  });

  it("refuses a state that is not on the Indian states list", async () => {
    const admin = await buildProfile();

    await expect(
      cityService.createCity({ name: "Paris", state: "France" as never }, admin.id),
    ).rejects.toThrow();
  });

  it("lists cities by state, then name", async () => {
    const admin = await buildProfile();
    await cityService.createCity({ name: "satara", state: "Maharashtra" }, admin.id);
    await cityService.createCity({ name: "Hubli", state: "Karnataka" }, admin.id);

    const listed = (await cityService.listCities()).map((city) => `${city.state}/${city.name}`);

    expect(listed).toEqual([
      "Karnataka/Belgaum",
      "Karnataka/Hubli",
      "Maharashtra/Belgaum",
      "Maharashtra/Ichalkaranji East",
      "Maharashtra/satara",
    ]);
  });
});
