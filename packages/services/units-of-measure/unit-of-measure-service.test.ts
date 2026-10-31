import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { beforeEach, describe, expect, it } from "vitest";

import { buildProfile, seedUnitsOfMeasure } from "../test/builders";
import UnitOfMeasureService from "./index";

const unitService = new UnitOfMeasureService();

describe("UnitOfMeasureService", () => {
  beforeEach(seedUnitsOfMeasure);

  it("lists the seeded units first, then the ones Admin adds, each add audited", async () => {
    const admin = await buildProfile();

    const pcs = await unitService.createUnit({ code: "  pcs " }, admin.id);

    expect(pcs).toMatchObject({ code: "pcs", createdBy: admin.id });
    expect((await unitService.listUnits()).map((unit) => unit.code)).toEqual([
      "ml",
      "L",
      "g",
      "kg",
      "pcs",
    ]);
    const [audit] = await listAuditLogsForEntity("unit_of_measure", pcs.id);
    expect(audit).toMatchObject({ action: "created", payload: { code: "pcs" } });
  });

  it("refuses a unit already there in any letter case, and one with a space", async () => {
    const admin = await buildProfile();

    await expect(unitService.createUnit({ code: "ML" }, admin.id)).rejects.toMatchObject({
      code: "CONFLICT",
      cause: { refusal: { reason: "unit_taken" } },
    });
    await expect(unitService.createUnit({ code: "big jar" }, admin.id)).rejects.toThrow();
  });
});
