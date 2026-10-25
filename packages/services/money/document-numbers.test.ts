import { db, eq } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { documentNumberSeriesTable } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import { buildProfile } from "../test/builders";
import { DocumentNumberService, formatDocumentNumber } from "./document-numbers";

const numbers = new DocumentNumberService();

async function seriesRow(financialYear: string, kind: "bill" | "credit_note") {
  const rows = await db
    .select()
    .from(documentNumberSeriesTable)
    .where(eq(documentNumberSeriesTable.financialYear, financialYear));
  return rows.find((row) => row.kind === kind);
}

describe("DocumentNumberService", () => {
  it("formats numbers to fit 16 characters", () => {
    expect(formatDocumentNumber("MB", "26-27", 1)).toBe("MB/26-27/000001");
    expect(formatDocumentNumber("MB", "26-27", 9_999_999)).toBe("MB/26-27/9999999");
    expect(formatDocumentNumber("MB", "26-27", 9_999_999).length).toBeLessThanOrEqual(16);
  });

  it("shows five unsaved defaults for an empty year without inserting them", async () => {
    const series = await numbers.getSeries("30-31");

    expect(series).toEqual([
      { kind: "bill", prefix: "MB", nextSeq: 1, firstUsedAt: null, frozen: false, saved: false },
      {
        kind: "credit_note",
        prefix: "MC",
        nextSeq: 1,
        firstUsedAt: null,
        frozen: false,
        saved: false,
      },
      {
        kind: "debit_note",
        prefix: "MD",
        nextSeq: 1,
        firstUsedAt: null,
        frozen: false,
        saved: false,
      },
      { kind: "payment", prefix: "MP", nextSeq: 1, firstUsedAt: null, frozen: false, saved: false },
      { kind: "refund", prefix: "MR", nextSeq: 1, firstUsedAt: null, frozen: false, saved: false },
    ]);
    expect(await seriesRow("30-31", "bill")).toBeUndefined();
  });

  it("creates a year's five series on first use and numbers from 000001", async () => {
    const admin = await buildProfile();

    const first = await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "bill", financialYear: "26-27", actorId: admin.id }),
    );
    const second = await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "bill", financialYear: "26-27", actorId: admin.id }),
    );

    expect(first).toEqual({
      number: "MB/26-27/000001",
      prefix: "MB",
      seq: 1,
      financialYear: "26-27",
    });
    expect(second.number).toBe("MB/26-27/000002");
    const series = await numbers.getSeries("26-27");
    expect(series.every((entry) => entry.saved)).toBe(true);
  });

  it("ensureFinancialYear returns only the kinds it inserted", async () => {
    const admin = await buildProfile();

    const firstRun = await runInTransaction((tx) =>
      numbers.ensureFinancialYear(tx, { financialYear: "27-28", actorId: admin.id }),
    );
    const secondRun = await runInTransaction((tx) =>
      numbers.ensureFinancialYear(tx, { financialYear: "27-28", actorId: admin.id }),
    );

    expect([...firstRun].sort()).toEqual([
      "bill",
      "credit_note",
      "debit_note",
      "payment",
      "refund",
    ]);
    expect(secondRun).toEqual([]);
  });

  it("freezes a series on its first number only, and uses a prefix set before first use", async () => {
    const admin = await buildProfile();
    await runInTransaction((tx) =>
      numbers.ensureFinancialYear(tx, { financialYear: "28-29", actorId: admin.id }),
    );
    await db
      .update(documentNumberSeriesTable)
      .set({ prefix: "XB" })
      .where(eq(documentNumberSeriesTable.financialYear, "28-29"));

    const first = await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "bill", financialYear: "28-29", actorId: admin.id }),
    );
    const frozenAt = (await seriesRow("28-29", "bill"))?.firstUsedAt;
    await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "bill", financialYear: "28-29", actorId: admin.id }),
    );

    expect(first.number).toBe("XB/28-29/000001");
    expect(frozenAt).toBeInstanceOf(Date);
    expect((await seriesRow("28-29", "bill"))?.firstUsedAt).toEqual(frozenAt);
    expect((await seriesRow("28-29", "credit_note"))?.firstUsedAt).toBeNull();
  });

  it("gives a number back when the caller's transaction rolls back", async () => {
    const admin = await buildProfile();
    await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "payment", financialYear: "26-27", actorId: admin.id }),
    );

    await expect(
      runInTransaction(async (tx) => {
        await numbers.allocate(tx, { kind: "payment", financialYear: "26-27", actorId: admin.id });
        throw new Error("refused after allocation");
      }),
    ).rejects.toThrow("refused after allocation");
    const next = await runInTransaction((tx) =>
      numbers.allocate(tx, { kind: "payment", financialYear: "26-27", actorId: admin.id }),
    );

    expect(next.number).toBe("MP/26-27/000002");
  });

  it("keeps financial years and kinds independent", async () => {
    const admin = await buildProfile();
    const allocate = (kind: "bill" | "refund", financialYear: string) =>
      runInTransaction((tx) => numbers.allocate(tx, { kind, financialYear, actorId: admin.id }));

    await allocate("bill", "31-32");
    await allocate("bill", "31-32");

    expect((await allocate("bill", "32-33")).number).toBe("MB/32-33/000001");
    expect((await allocate("refund", "31-32")).number).toBe("MR/31-32/000001");
  });

  it("hands parallel callers distinct consecutive numbers, even on a brand-new year", async () => {
    const admin = await buildProfile();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        runInTransaction((tx) =>
          numbers.allocate(tx, { kind: "debit_note", financialYear: "33-34", actorId: admin.id }),
        ),
      ),
    );

    expect(results.map((result) => result.seq).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("does not block another kind while the first use of a new year is still open", async () => {
    const admin = await buildProfile();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let billAllocated!: () => void;
    const billReady = new Promise<void>((resolve) => (billAllocated = resolve));

    const billTx = runInTransaction(async (tx) => {
      const result = await numbers.allocate(tx, {
        kind: "bill",
        financialYear: "35-36",
        actorId: admin.id,
      });
      billAllocated();
      await held;
      return result;
    });
    await billReady;
    const payment = await Promise.race([
      runInTransaction((tx) =>
        numbers.allocate(tx, { kind: "payment", financialYear: "35-36", actorId: admin.id }),
      ),
      new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 3_000)),
    ]);
    release();

    expect(payment).toMatchObject({ number: "MP/35-36/000001" });
    expect((await billTx).number).toBe("MB/35-36/000001");
  });

  it("refuses to number past 9,999,999", async () => {
    const admin = await buildProfile();
    await runInTransaction((tx) =>
      numbers.ensureFinancialYear(tx, { financialYear: "34-35", actorId: admin.id }),
    );
    await db
      .update(documentNumberSeriesTable)
      .set({ nextSeq: 10_000_000 })
      .where(eq(documentNumberSeriesTable.financialYear, "34-35"));

    await expect(
      runInTransaction((tx) =>
        numbers.allocate(tx, { kind: "bill", financialYear: "34-35", actorId: admin.id }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
