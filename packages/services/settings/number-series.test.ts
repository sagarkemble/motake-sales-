import { db, eq } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { auditLogsTable, documentNumberSeriesTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentNumberService from "../document-numbers";
import { wipeApplicationTables } from "../test/database";
import { buildProfile } from "../test/builders";
import SettingsService from "./index";

const settings = new SettingsService();
const numbers = new DocumentNumberService();

// 25 Oct 2026 IST: the current financial year is 26-27 and the next is 27-28.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:30:00Z"));
  await wipeApplicationTables();
});

afterEach(() => {
  vi.useRealTimers();
});

async function seriesRows(financialYear: string) {
  return db
    .select()
    .from(documentNumberSeriesTable)
    .where(eq(documentNumberSeriesTable.financialYear, financialYear));
}

function issueBill(financialYear: string, actorId: string) {
  return runInTransaction((tx) => numbers.allocate({ kind: "bill", financialYear, actorId }, tx));
}

describe("Number prefixes", () => {
  it("lists five editable defaults with a preview for a year with no rows, without creating any", async () => {
    const series = await settings.listNumberSeries("26-27");

    expect(series.map((entry) => entry.prefix)).toEqual(["MB", "MC", "MD", "MP", "MR"]);
    expect(series.every((entry) => entry.editable && !entry.saved && entry.id === null)).toBe(true);
    expect(series[0]).toMatchObject({
      kind: "bill",
      nextSeq: 1,
      firstUsedAt: null,
      nextNumberPreview: "MB/26-27/000001",
    });
    expect(await seriesRows("26-27")).toEqual([]);
  });

  it("shows earlier years read-only", async () => {
    const series = await settings.listNumberSeries("25-26");

    expect(series.every((entry) => !entry.editable)).toBe(true);
  });

  it("creates the year's missing rows on the first change and audits each one", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });

    const series = await settings.updatePrefix(
      { financialYear: "26-27", kind: "bill", prefix: " xb ", reason: "New token" },
      admin.id,
    );

    const bill = series.find((entry) => entry.kind === "bill")!;
    expect(bill).toMatchObject({ prefix: "XB", saved: true, nextNumberPreview: "XB/26-27/000001" });
    expect(await seriesRows("26-27")).toHaveLength(5);
    const audits = await db.select().from(auditLogsTable);
    expect(audits.filter((row) => row.action === "created")).toHaveLength(5);
    const history = await settings.listNumberSeriesHistory(bill.id!);
    expect(history).toEqual([
      expect.objectContaining({
        action: "updated",
        actorName: "Asha Admin",
        reason: "New token",
        payload: { financialYear: "26-27", kind: "bill", prefix: { from: "MB", to: "XB" } },
      }),
      expect.objectContaining({
        action: "created",
        payload: { financialYear: "26-27", kind: "bill", prefix: "MB" },
      }),
    ]);
  });

  it("writes an updated row on an existing series and nothing when the prefix is unchanged", async () => {
    const admin = await buildProfile();
    await settings.updatePrefix({ financialYear: "26-27", kind: "refund", prefix: "RF" }, admin.id);
    const auditCount = (await db.select().from(auditLogsTable)).length;

    await settings.updatePrefix({ financialYear: "26-27", kind: "refund", prefix: "rf" }, admin.id);
    await settings.updatePrefix({ financialYear: "26-27", kind: "refund", prefix: "RG" }, admin.id);

    const audits = await db.select().from(auditLogsTable);
    expect(audits).toHaveLength(auditCount + 1);
    const refund = (await seriesRows("26-27")).find((row) => row.kind === "refund");
    expect(refund?.prefix).toBe("RG");
    const [latest] = await settings.listNumberSeriesHistory(refund!.id);
    expect(latest).toMatchObject({
      action: "updated",
      payload: { financialYear: "26-27", kind: "refund", prefix: { from: "RF", to: "RG" } },
    });
  });

  it("refuses a prefix that is too long, empty, has digits or a slash, or repeats another kind", async () => {
    const admin = await buildProfile();
    const update = (prefix: string, kind: "bill" | "payment" = "bill") =>
      settings.updatePrefix({ financialYear: "26-27", kind, prefix }, admin.id);

    await expect(update("MBX")).rejects.toThrow();
    await expect(update("  ")).rejects.toThrow();
    await expect(update("M1")).rejects.toThrow();
    await expect(update("M/")).rejects.toThrow();
    await expect(update("MP")).rejects.toMatchObject({ code: "CONFLICT" });
    await update("XP", "payment");
    await expect(update("XP")).rejects.toMatchObject({ code: "CONFLICT" });

    expect((await seriesRows("26-27")).find((row) => row.kind === "bill")?.prefix).toBe("MB");
  });

  it("freezes a series once its first number is issued, but not the other series", async () => {
    const admin = await buildProfile();
    await issueBill("26-27", admin.id);

    await expect(
      settings.updatePrefix({ financialYear: "26-27", kind: "bill", prefix: "XB" }, admin.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await settings.updatePrefix(
      { financialYear: "26-27", kind: "credit_note", prefix: "XC" },
      admin.id,
    );

    const series = await settings.listNumberSeries("26-27");
    expect(series.find((entry) => entry.kind === "bill")).toMatchObject({
      editable: false,
      nextNumberPreview: "MB/26-27/000002",
    });
    expect(series.find((entry) => entry.kind === "credit_note")).toMatchObject({
      prefix: "XC",
      editable: true,
    });
  });

  it("uses a prefix set before the first issue", async () => {
    const admin = await buildProfile();
    await settings.updatePrefix({ financialYear: "27-28", kind: "bill", prefix: "NB" }, admin.id);

    const first = await issueBill("27-28", admin.id);

    expect(first.number).toBe("NB/27-28/000001");
  });

  it("refuses a change that waited behind the year's first number", async () => {
    const admin = await buildProfile();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let allocated!: () => void;
    const billReady = new Promise<void>((resolve) => (allocated = resolve));

    const billTx = runInTransaction(async (tx) => {
      const result = await numbers.allocate(
        { kind: "bill", financialYear: "26-27", actorId: admin.id },
        tx,
      );
      allocated();
      await held;
      return result;
    });
    await billReady;
    const change = settings
      .updatePrefix({ financialYear: "26-27", kind: "bill", prefix: "XB" }, admin.id)
      .then(
        () => "changed",
        (error: { code?: string }) => error.code,
      );
    const beforeRelease = await Promise.race([
      change,
      new Promise((resolve) => setTimeout(() => resolve("waiting"), 500)),
    ]);
    release();

    expect(beforeRelease).toBe("waiting");
    expect(await change).toBe("CONFLICT");
    expect((await billTx).number).toBe("MB/26-27/000001");
  });

  it("lets only one of two parallel changes take the same new prefix", async () => {
    const admin = await buildProfile();
    await settings.updatePrefix({ financialYear: "26-27", kind: "refund", prefix: "RF" }, admin.id);

    const results = await Promise.allSettled([
      settings.updatePrefix({ financialYear: "26-27", kind: "bill", prefix: "XY" }, admin.id),
      settings.updatePrefix({ financialYear: "26-27", kind: "payment", prefix: "XY" }, admin.id),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.filter((result) => result.status === "rejected");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    expect((refused[0] as PromiseRejectedResult).reason.message).toMatch(/already used/);
    const prefixes = (await seriesRows("26-27")).map((row) => row.prefix);
    expect(prefixes.filter((prefix) => prefix === "XY")).toHaveLength(1);
  });

  it("refuses edits to past years and to years beyond next", async () => {
    const admin = await buildProfile();

    await expect(
      settings.updatePrefix({ financialYear: "25-26", kind: "bill", prefix: "XB" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.updatePrefix({ financialYear: "28-29", kind: "bill", prefix: "XB" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(documentNumberSeriesTable)).toEqual([]);
  });

  it("prepares next year with defaults once, keeps existing rows, and refuses other years", async () => {
    const admin = await buildProfile();
    await settings.updatePrefix({ financialYear: "27-28", kind: "bill", prefix: "NB" }, admin.id);
    await db.delete(documentNumberSeriesTable).where(eq(documentNumberSeriesTable.kind, "refund"));
    const auditsBefore = (await db.select().from(auditLogsTable)).length;

    const prepared = await settings.prepareFinancialYear({ financialYear: "27-28" }, admin.id);
    const again = await settings.prepareFinancialYear({ financialYear: "27-28" }, admin.id);

    expect(prepared.map((entry) => entry.prefix)).toEqual(["NB", "MC", "MD", "MP", "MR"]);
    expect(prepared.every((entry) => entry.saved)).toBe(true);
    expect(again).toEqual(prepared);
    const audits = await db.select().from(auditLogsTable);
    expect(audits).toHaveLength(auditsBefore + 1);
    await expect(
      settings.prepareFinancialYear({ financialYear: "26-27" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.prepareFinancialYear({ financialYear: "28-29" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
