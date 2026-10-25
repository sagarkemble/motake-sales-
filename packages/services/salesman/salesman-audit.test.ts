import { listAuditLogsForEntity } from "@repo/database/queries/audit";
import { describe, expect, it } from "vitest";

import { buildProfile, buildSalesman } from "../test/builders";
import SalesmanService from "./index";

const salesmanService = new SalesmanService();

describe("SalesmanService audit", () => {
  it("records a salesman code change with the old and new code", async () => {
    const admin = await buildProfile();
    const { profile: salesman } = await buildSalesman({ salesmanCode: "SM100" });

    await salesmanService.updateSalesmanCode(salesman.id, { salesmanCode: "SM200" }, admin.id);

    const rows = await listAuditLogsForEntity("salesman", salesman.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "updated",
      actorId: admin.id,
      payload: { salesmanCode: { from: "SM100", to: "SM200" } },
    });
  });
});
