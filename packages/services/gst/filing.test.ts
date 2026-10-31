import { asc, db, eq } from "@repo/database";
import { auditLogsTable, gstr1FilingsTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProfile } from "../test/builders";
import { wipeApplicationTables } from "../test/database";
import {
  buildGstinWorld,
  buildGstHarness,
  placeBill,
  rejectionOf,
  setBusinessDay,
  type GstHarness,
} from "../test/gst-world";
import GstService from "./index";

let harness: GstHarness;

beforeEach(async () => {
  await wipeApplicationTables();
  vi.useFakeTimers({ toFake: ["Date"] });
  setBusinessDay("2026-11-03");
  harness = buildGstHarness();
});

afterEach(() => {
  vi.useRealTimers();
});

async function filingRows() {
  return db.select().from(gstr1FilingsTable).orderBy(asc(gstr1FilingsTable.periodMonth));
}

async function filingAuditRows(filingId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.entityId, filingId))
    .orderBy(asc(auditLogsTable.createdAt));
}

const october = { month: "2026-10", filedOn: "2026-11-02", reference: "AA271026000123X" };

describe("GstService.recordGstr1Filing", () => {
  it("records the month as its first day, with the signed-in Admin as filer and a filed audit row", async () => {
    const admin = await buildProfile();

    const result = await harness.gstService.recordGstr1Filing(admin.id, {
      ...october,
      reference: "  AA271026000123X  ",
      notes: "Filed by the CA",
    });

    expect(result.filing).toMatchObject({
      periodMonth: "2026-10-01",
      filedOn: "2026-11-02",
      reference: "AA271026000123X",
      notes: "Filed by the CA",
      filerId: admin.id,
    });
    expect(await filingRows()).toHaveLength(1);
    expect(await filingAuditRows(result.filing.id)).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        action: "filed",
        entityType: "gstr1_filing",
        customerId: null,
        reason: null,
        payload: {
          month: "2026-10",
          filedOn: "2026-11-02",
          reference: "AA271026000123X",
          notes: "Filed by the CA",
        },
      }),
    ]);
  });

  it("refuses a second filing for the same month: already filed — Correct it", async () => {
    const admin = await buildProfile();
    await harness.gstService.recordGstr1Filing(admin.id, october);

    const error = await rejectionOf(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, reference: "OTHER" }),
    );

    expect(error).toMatchObject({ code: "CONFLICT" });
    expect(error.message).toContain("already filed — Correct it");
    expect(await filingRows()).toHaveLength(1);
  });

  it("two Admins recording the same month at once: exactly one lands, the other is told it is filed", async () => {
    const first = await buildProfile();
    const second = await buildProfile();

    const results = await Promise.allSettled([
      harness.gstService.recordGstr1Filing(first.id, october),
      harness.gstService.recordGstr1Filing(second.id, { ...october, reference: "SECOND" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((result) => result.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect(await filingRows()).toHaveLength(1);
  });

  it("allows the current month and refuses a month that has not started", async () => {
    const admin = await buildProfile();

    await harness.gstService.recordGstr1Filing(admin.id, {
      month: "2026-11",
      filedOn: "2026-11-03",
      reference: "EARLY",
    });
    const error = await rejectionOf(
      harness.gstService.recordGstr1Filing(admin.id, {
        month: "2026-12",
        filedOn: "2026-11-03",
        reference: "FUTURE",
      }),
    );

    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect(error.message).toContain("has not started");
    expect((await filingRows()).map((row) => row.periodMonth)).toEqual(["2026-11-01"]);
  });

  it("refuses a filing date before the month starts or after today (Asia/Kolkata)", async () => {
    const admin = await buildProfile();

    const early = await rejectionOf(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, filedOn: "2026-09-30" }),
    );
    const late = await rejectionOf(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, filedOn: "2026-11-04" }),
    );

    expect(early).toMatchObject({ code: "BAD_REQUEST" });
    expect(early.message).toContain("before Oct 2026 starts");
    expect(late.message).toContain("after today");
    expect(await filingRows()).toHaveLength(0);
  });

  it("today is the IST day: 23:00 IST on 3 Nov allows 3 Nov, not 4 Nov", async () => {
    const admin = await buildProfile();
    vi.setSystemTime(new Date("2026-11-03T17:30:00Z"));

    const error = await rejectionOf(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, filedOn: "2026-11-04" }),
    );
    await harness.gstService.recordGstr1Filing(admin.id, { ...october, filedOn: "2026-11-03" });

    expect(error.message).toContain("after today");
    expect(await filingRows()).toHaveLength(1);
  });

  it("a month starts at midnight Asia/Kolkata: 23:59 IST on 31 Oct refuses Nov, 00:30 IST on 1 Nov allows it", async () => {
    const admin = await buildProfile();
    const november = { month: "2026-11", filedOn: "2026-11-01", reference: "NOV-ACK" };

    // 18:29 UTC on 31 Oct is 23:59 IST, still October.
    vi.setSystemTime(new Date("2026-10-31T18:29:00Z"));
    const early = await rejectionOf(harness.gstService.recordGstr1Filing(admin.id, november));
    const earlyPreview = await rejectionOf(
      harness.gstService.previewGstr1Filing({ month: "2026-11" }),
    );
    // 19:00 UTC on 31 Oct is 00:30 IST on 1 Nov: still October in UTC, November in India.
    vi.setSystemTime(new Date("2026-10-31T19:00:00Z"));
    const preview = await harness.gstService.previewGstr1Filing({ month: "2026-11" });
    await harness.gstService.recordGstr1Filing(admin.id, november);

    expect(early).toMatchObject({ code: "BAD_REQUEST" });
    expect(early.message).toContain("Nov 2026 has not started");
    expect(earlyPreview.message).toContain("has not started");
    expect(preview).toMatchObject({ month: "2026-11", alreadyFiled: false });
    expect((await filingRows()).map((row) => row.periodMonth)).toEqual(["2026-11-01"]);
  });

  it("refuses a filing date that is not on the calendar", async () => {
    const admin = await buildProfile();

    await expect(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, filedOn: "2026-10-32" }),
    ).rejects.toThrow(/real calendar date/);
    expect(await filingRows()).toHaveLength(0);
  });

  it("requires the reference and a YYYY-MM month", async () => {
    const admin = await buildProfile();

    await expect(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, reference: "   " }),
    ).rejects.toThrow(/reference is required/);
    await expect(
      harness.gstService.recordGstr1Filing(admin.id, { ...october, month: "2026-13" }),
    ).rejects.toThrow(/YYYY-MM/);
    expect(await filingRows()).toHaveLength(0);
  });

  it("previews the Bills dated in the month and then records it", async () => {
    setBusinessDay("2026-10-25");
    const world = await buildGstinWorld({ businessDate: "2026-10-25" });
    await placeBill(world);
    await placeBill(world, { curd: 2 });
    setBusinessDay("2026-11-03");

    const preview = await harness.gstService.previewGstr1Filing({ month: "2026-10" });
    const result = await harness.gstService.recordGstr1Filing(world.admin.id, october);

    expect(preview).toEqual({
      month: "2026-10",
      alreadyFiled: false,
      billsDatedInMonth: 2,
    });
    expect(result.filing.periodMonth).toBe("2026-10-01");
    expect(await harness.gstService.previewGstr1Filing({ month: "2026-10" })).toMatchObject({
      alreadyFiled: true,
    });
  });
});

describe("GstService.correctGstr1Filing", () => {
  it("changes date, reference and notes with a reason, keeps month and original filer, audits old and new", async () => {
    const filer = await buildProfile();
    const corrector = await buildProfile();
    const { filing } = await harness.gstService.recordGstr1Filing(filer.id, october);

    const corrected = await harness.gstService.correctGstr1Filing(corrector.id, {
      filingId: filing.id,
      filedOn: "2026-11-01",
      reference: "AA271026000124X",
      notes: "Typo in the ack",
      reason: "Copied the wrong ack",
    });

    expect(corrected).toMatchObject({
      id: filing.id,
      periodMonth: "2026-10-01",
      filerId: filer.id,
      filedOn: "2026-11-01",
      reference: "AA271026000124X",
      notes: "Typo in the ack",
    });
    const audits = await filingAuditRows(filing.id);
    expect(audits.map((row) => row.action)).toEqual(["filed", "corrected"]);
    expect(audits[1]).toMatchObject({
      actorId: corrector.id,
      reason: "Copied the wrong ack",
      customerId: null,
      payload: {
        filedOn: { old: "2026-11-02", new: "2026-11-01" },
        reference: { old: "AA271026000123X", new: "AA271026000124X" },
        notes: { old: null, new: "Typo in the ack" },
      },
    });
  });

  it("requires a reason, applies the same date rules and refuses a Correct that changes nothing", async () => {
    const admin = await buildProfile();
    const { filing } = await harness.gstService.recordGstr1Filing(admin.id, october);

    await expect(
      harness.gstService.correctGstr1Filing(admin.id, {
        filingId: filing.id,
        filedOn: "2026-11-01",
        reference: october.reference,
        reason: " ",
      }),
    ).rejects.toThrow(/reason is required/);
    const early = await rejectionOf(
      harness.gstService.correctGstr1Filing(admin.id, {
        filingId: filing.id,
        filedOn: "2026-09-30",
        reference: october.reference,
        reason: "Wrong date",
      }),
    );
    const unchanged = await rejectionOf(
      harness.gstService.correctGstr1Filing(admin.id, {
        filingId: filing.id,
        filedOn: october.filedOn,
        reference: october.reference,
        reason: "No change",
      }),
    );

    expect(early.message).toContain("before Oct 2026 starts");
    expect(unchanged.message).toContain("Nothing changed");
    expect((await filingAuditRows(filing.id)).map((row) => row.action)).toEqual(["filed"]);
  });

  it("has no way to delete or unfile a month", () => {
    const methods = Object.getOwnPropertyNames(GstService.prototype);
    expect(methods.filter((name) => /delete|unfile|remove/i.test(name))).toEqual([]);
  });
});

describe("GstService.listGstr1Filings", () => {
  it("lists filed months newest first with filing date, reference, filer and notes", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });
    await harness.gstService.recordGstr1Filing(admin.id, {
      month: "2026-09",
      filedOn: "2026-10-11",
      reference: "SEP",
    });
    await harness.gstService.recordGstr1Filing(admin.id, { ...october, notes: "On time" });

    const filings = await harness.gstService.listGstr1Filings();

    expect(filings).toEqual([
      expect.objectContaining({
        periodMonth: "2026-10-01",
        filedOn: "2026-11-02",
        reference: october.reference,
        notes: "On time",
        filerId: admin.id,
        filerName: "Asha Admin",
      }),
      expect.objectContaining({ periodMonth: "2026-09-01", reference: "SEP", notes: null }),
    ]);
  });
});
