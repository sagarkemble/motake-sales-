import { randomUUID } from "node:crypto";

import { and, db, eq } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { auditLogsTable, varietyTaxPeriodsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProductService from "../products";
import { buildProfile, buildVariety, buildVarietyTaxPeriod } from "../test/builders";
import VarietyTaxPeriodService from "./index";

const taxPeriods = new VarietyTaxPeriodService();
const products = new ProductService();

// 25 Oct 2026 in Kolkata, so the current financial year is 26-27.
const TODAY = new Date("2026-10-25T06:00:00Z");

function freezeClock(instant: Date) {
  vi.setSystemTime(instant);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  freezeClock(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const admin = await buildProfile();
  const variety = await buildVariety();
  return { admin, variety };
}

const taxable = (varietyId: string, effectiveFrom: string, gstRateBps = 500) => ({
  varietyId,
  effectiveFrom,
  hsn: "0401",
  exempt: false,
  gstRateBps,
});

async function periodRows(varietyId: string) {
  return db
    .select()
    .from(varietyTaxPeriodsTable)
    .where(eq(varietyTaxPeriodsTable.varietyId, varietyId));
}

async function auditRows(entityId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityType, "variety_tax_period"),
        eq(auditLogsTable.entityId, entityId),
      ),
    );
}

describe("covering lookup", () => {
  it("picks the latest start on or before the day, and nothing before the first start", async () => {
    const { variety } = await setup();
    const first = await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2026-04-01" });
    const second = await buildVarietyTaxPeriod(variety.id, {
      effectiveFrom: "2026-10-15",
      gstRateBps: 1200,
    });
    const on = async (day: string) =>
      (await taxPeriods.getCoveringTaxFacts({ varietyIds: [variety.id], day })).get(variety.id);

    expect(await on("2026-03-31")).toBeUndefined();
    expect(await on("2026-04-01")).toMatchObject({ periodId: first.id, gstRateBps: 500 });
    expect(await on("2026-10-14")).toMatchObject({ periodId: first.id });
    expect(await on("2026-10-15")).toEqual({
      periodId: second.id,
      effectiveFrom: "2026-10-15",
      hsn: "0401",
      exempt: false,
      gstRateBps: 1200,
    });
    expect(await on("2030-01-01")).toMatchObject({ periodId: second.id });
  });

  it("answers several Varieties at once and leaves out the uncovered ones", async () => {
    const { variety: covered } = await setup();
    const uncovered = await buildVariety();
    const exempt = await buildVariety();
    await buildVarietyTaxPeriod(covered.id, { effectiveFrom: "2026-04-01" });
    await buildVarietyTaxPeriod(exempt.id, {
      effectiveFrom: "2026-04-01",
      exempt: true,
      gstRateBps: 0,
    });

    const facts = await taxPeriods.getCoveringTaxFacts({
      varietyIds: [covered.id, uncovered.id, exempt.id],
      day: "2026-10-25",
    });

    expect([...facts.keys()].sort()).toEqual([covered.id, exempt.id].sort());
    expect(facts.get(exempt.id)).toMatchObject({ exempt: true, gstRateBps: 0 });
  });

  it("sees the caller's transaction's own writes", async () => {
    const { variety } = await setup();

    const facts = await runInTransaction(async (tx) => {
      await tx
        .insert(varietyTaxPeriodsTable)
        .values({ ...taxable(variety.id, "2026-04-01"), hsn: "0402" });
      return taxPeriods.getCoveringTaxFacts({ varietyIds: [variety.id], day: "2026-10-25" }, tx);
    });

    expect(facts.get(variety.id)).toMatchObject({ hsn: "0402" });
  });

  it("requireCoveringTaxFacts refuses once, listing every uncovered Variety", async () => {
    const { variety: covered } = await setup();
    const first = await buildVariety({ name: "Toned milk 500 ml" });
    const second = await buildVariety({ name: "Curd 1 kg" });
    await buildVarietyTaxPeriod(covered.id, { effectiveFrom: "2026-04-01" });

    const refusal = taxPeriods.requireCoveringTaxFacts({
      varietyIds: [covered.id, first.id, second.id],
      day: "2026-10-25",
    });

    await expect(refusal).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Toned milk 500 ml"),
    });
    const error = (await refusal.catch((caught: unknown) => caught)) as { cause: unknown };
    expect(error.cause).toMatchObject({
      day: "2026-10-25",
      uncoveredVarieties: [
        { id: first.id, name: "Toned milk 500 ml", sku: first.sku },
        { id: second.id, name: "Curd 1 kg", sku: second.sku },
      ],
    });

    const facts = await taxPeriods.requireCoveringTaxFacts({
      varietyIds: [covered.id],
      day: "2026-10-25",
    });
    expect(facts.get(covered.id)).toBeDefined();
  });
});

describe("Admin reads", () => {
  it("lists newest start first with Covers today, Upcoming and editable flags", async () => {
    const { variety } = await setup();
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2025-04-01" });
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2026-04-01" });
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2027-01-01", gstRateBps: 1200 });

    const list = await taxPeriods.listForVariety(variety.id);

    expect(list.today).toBe("2026-10-25");
    expect(list.currentFinancialYear).toEqual({
      financialYear: "26-27",
      firstDay: "2026-04-01",
      lastDay: "2027-03-31",
    });
    expect(
      list.periods.map(({ effectiveFrom, coversToday, upcoming, editable }) => ({
        effectiveFrom,
        coversToday,
        upcoming,
        editable,
      })),
    ).toEqual([
      { effectiveFrom: "2027-01-01", coversToday: false, upcoming: true, editable: true },
      { effectiveFrom: "2026-04-01", coversToday: true, upcoming: false, editable: true },
      { effectiveFrom: "2025-04-01", coversToday: false, upcoming: false, editable: false },
    ]);
  });

  it("marks every period of a soft-deleted Variety not editable", async () => {
    const { admin, variety } = await setup();
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2026-04-01" });
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2027-01-01", gstRateBps: 1200 });
    await products.deactivateProductVariety(variety.id, admin.id);

    const list = await taxPeriods.listForVariety(variety.id);

    expect(
      list.periods.map(({ effectiveFrom, editable }) => ({ effectiveFrom, editable })),
    ).toEqual([
      { effectiveFrom: "2027-01-01", editable: false },
      { effectiveFrom: "2026-04-01", editable: false },
    ]);
  });

  it("refuses an unknown Variety", async () => {
    await expect(taxPeriods.listForVariety(randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("gives today's period per Variety, or null", async () => {
    const { variety: covered } = await setup();
    const uncovered = await buildVariety();
    const period = await buildVarietyTaxPeriod(covered.id, { effectiveFrom: "2026-04-01" });
    await buildVarietyTaxPeriod(covered.id, { effectiveFrom: "2026-11-01", gstRateBps: 1200 });

    expect(await taxPeriods.getCurrentForVarieties([covered.id, uncovered.id])).toEqual([
      { varietyId: covered.id, period: expect.objectContaining({ periodId: period.id }) },
      { varietyId: uncovered.id, period: null },
    ]);
  });

  it("reads today in Asia/Kolkata, not UTC", async () => {
    const { variety } = await setup();
    await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2026-10-26", hsn: "0402" });
    // 25 Oct 2026 19:00 UTC is 26 Oct 00:30 in Kolkata.
    freezeClock(new Date("2026-10-25T19:00:00Z"));

    const [current] = await taxPeriods.getCurrentForVarieties([variety.id]);

    expect(current?.period).toMatchObject({ hsn: "0402" });
  });
});

describe("year rule", () => {
  it("allows starts on 1 Apr 2026 and 15 Oct 2026 and refuses 1 Apr 2027", async () => {
    const { admin, variety } = await setup();

    await taxPeriods.upsert(taxable(variety.id, "2026-04-01"), admin.id);
    await taxPeriods.upsert(taxable(variety.id, "2026-10-15"), admin.id);
    await expect(
      taxPeriods.upsert(taxable(variety.id, "2027-04-01"), admin.id),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Only starts from 1 Apr 2026 to 31 Mar 2027 can be added or changed",
    });

    expect((await periodRows(variety.id)).map((row) => row.effectiveFrom).sort()).toEqual([
      "2026-04-01",
      "2026-10-15",
    ]);
  });

  it("refuses to add, edit or delete a past-year start entered by hand at go-live", async () => {
    const { admin, variety } = await setup();
    const goLive = await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2025-04-01" });

    await expect(
      taxPeriods.upsert(taxable(variety.id, "2025-06-01"), admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      taxPeriods.upsert({ ...taxable(variety.id, "2025-04-01"), hsn: "0402" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(taxPeriods.delete(goLive.id, admin.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Only periods starting 1 Apr 2026 to 31 Mar 2027 can be deleted",
    });

    expect(await periodRows(variety.id)).toEqual([goLive]);
  });

  it("uses the Kolkata day at the year end: 31 Mar 2027 19:00 UTC is already 27-28", async () => {
    const { admin, variety } = await setup();

    freezeClock(new Date("2027-03-31T18:00:00Z"));
    await taxPeriods.upsert(taxable(variety.id, "2027-03-31"), admin.id);
    await expect(
      taxPeriods.upsert(taxable(variety.id, "2027-04-01"), admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    freezeClock(new Date("2027-03-31T19:00:00Z"));
    await taxPeriods.upsert(taxable(variety.id, "2027-04-01"), admin.id);
    await expect(
      taxPeriods.upsert(taxable(variety.id, "2027-03-31", 1200), admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("upsert", () => {
  it("creates a period and audits it", async () => {
    const { admin, variety } = await setup();

    const result = await taxPeriods.upsert(taxable(variety.id, "2026-04-01"), admin.id);

    expect(result.outcome).toBe("created");
    expect(await periodRows(variety.id)).toEqual([result.period]);
    expect(await auditRows(result.period.id)).toEqual([
      expect.objectContaining({
        action: "created",
        actorId: admin.id,
        customerId: null,
        payload: {
          varietyId: variety.id,
          effectiveFrom: "2026-04-01",
          hsn: "0401",
          exempt: false,
          gstRateBps: 500,
        },
      }),
    ]);
  });

  it("overwrites HSN, exempt and rate when the start already exists", async () => {
    const { admin, variety } = await setup();
    const { period: first } = await taxPeriods.upsert(taxable(variety.id, "2026-04-01"), admin.id);

    const result = await taxPeriods.upsert(
      {
        varietyId: variety.id,
        effectiveFrom: "2026-04-01",
        hsn: "04012",
        exempt: true,
        gstRateBps: 0,
      },
      admin.id,
    );

    expect(result.outcome).toBe("overwritten");
    const rows = await periodRows(variety.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      hsn: "04012",
      exempt: true,
      gstRateBps: 0,
      createdAt: first.createdAt,
    });
    const updated = (await auditRows(first.id)).find((row) => row.action === "updated");
    expect(updated).toMatchObject({
      actorId: admin.id,
      payload: {
        hsn: { from: "0401", to: "04012" },
        exempt: { from: false, to: true },
        gstRateBps: { from: 500, to: 0 },
      },
    });
  });

  it("refuses a bad HSN", async () => {
    const { admin, variety } = await setup();
    for (const hsn of ["040", "040123456", "04A1"]) {
      await expect(
        taxPeriods.upsert({ ...taxable(variety.id, "2026-04-01"), hsn }, admin.id),
      ).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(await periodRows(variety.id)).toEqual([]);
  });

  it("refuses exempt with a rate and taxable at 0%", async () => {
    const { admin, variety } = await setup();
    await expect(
      taxPeriods.upsert({ ...taxable(variety.id, "2026-04-01"), exempt: true }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      taxPeriods.upsert(taxable(variety.id, "2026-04-01", 0), admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await periodRows(variety.id)).toEqual([]);
  });

  it("refuses an unknown or soft-deleted Variety", async () => {
    const { admin, variety } = await setup();
    await products.deactivateProductVariety(variety.id, admin.id);

    await expect(
      taxPeriods.upsert(taxable(randomUUID(), "2026-04-01"), admin.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      taxPeriods.upsert(taxable(variety.id, "2026-04-01"), admin.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("delete", () => {
  it("lets an earlier period cover today again and audits the old values", async () => {
    const { admin, variety } = await setup();
    const earlier = await buildVarietyTaxPeriod(variety.id, { effectiveFrom: "2025-04-01" });
    const { period: wrong } = await taxPeriods.upsert(
      taxable(variety.id, "2026-10-01", 1800),
      admin.id,
    );

    const result = await taxPeriods.delete(wrong.id, admin.id);

    expect(result.deleted.id).toBe(wrong.id);
    expect(result.coveringToday).toMatchObject({ periodId: earlier.id });
    expect(await periodRows(variety.id)).toEqual([earlier]);
    const deleted = (await auditRows(wrong.id)).find((row) => row.action === "deleted");
    expect(deleted).toMatchObject({
      actorId: admin.id,
      payload: {
        varietyId: variety.id,
        effectiveFrom: "2026-10-01",
        hsn: "0401",
        exempt: false,
        gstRateBps: 1800,
      },
    });
  });

  it("deleting the only period leaves the Variety unsellable", async () => {
    const { admin, variety } = await setup();
    const { period } = await taxPeriods.upsert(taxable(variety.id, "2026-04-01"), admin.id);

    const result = await taxPeriods.delete(period.id, admin.id);

    expect(result.coveringToday).toBeNull();
    const day = "2026-10-25";
    expect(
      (await taxPeriods.getCoveringTaxFacts({ varietyIds: [variety.id], day })).has(variety.id),
    ).toBe(false);
    await expect(
      taxPeriods.requireCoveringTaxFacts({ varietyIds: [variety.id], day }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses an unknown period", async () => {
    const { admin } = await setup();
    await expect(taxPeriods.delete(randomUUID(), admin.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
