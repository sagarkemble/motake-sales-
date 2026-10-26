import { db } from "@repo/database";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import { gstCreditNoteDeadlinesTable } from "@repo/database/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DocumentNumberService from "../document-numbers";
import GstCreditNoteDeadlineService from "../gst-credit-note-deadline";
import { wipeApplicationTables } from "../test/database";
import { buildProfile } from "../test/builders";
import SettingsService from "./index";

const settings = new SettingsService();
const numbers = new DocumentNumberService();
const deadlines = new GstCreditNoteDeadlineService();

// 25 Oct 2026 IST: the current financial year is 26-27 and the next is 27-28.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T06:30:00Z"));
  await wipeApplicationTables();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GST Credit Note deadline settings", () => {
  it("lists the current and next year on their defaults when nothing is in use", async () => {
    expect(await settings.listCreditNoteDeadlines()).toEqual([
      { financialYear: "27-28", deadlineDate: "2028-11-30", source: "default" },
      { financialYear: "26-27", deadlineDate: "2027-11-30", source: "default" },
    ]);
    expect(await db.select().from(gstCreditNoteDeadlinesTable)).toEqual([]);
  });

  it("starts the list at the earliest year in use", async () => {
    const admin = await buildProfile();
    await runInTransaction((tx) =>
      numbers.ensureFinancialYear({ financialYear: "24-25", actorId: admin.id }, tx),
    );

    const years = await settings.listCreditNoteDeadlines();

    expect(years.map((entry) => entry.financialYear)).toEqual(["27-28", "26-27", "25-26", "24-25"]);
  });

  it("audits the first date as created and a later change as updated, newest first", async () => {
    const admin = await buildProfile({ name: "Asha Admin" });

    const first = await settings.setCreditNoteDeadline(
      { financialYear: "26-27", date: "2027-10-31", reason: "CA instruction 12 Oct" },
      admin.id,
    );
    const second = await settings.setCreditNoteDeadline(
      { financialYear: "26-27", date: "2027-11-15" },
      admin.id,
    );

    expect(first).toEqual({
      financialYear: "26-27",
      deadlineDate: "2027-10-31",
      source: "configured",
    });
    expect(second.deadlineDate).toBe("2027-11-15");
    expect(await deadlines.getDeadline("26-27")).toEqual({
      deadlineDate: "2027-11-15",
      source: "configured",
    });
    expect(await settings.listCreditNoteDeadlineHistory("26-27")).toEqual([
      expect.objectContaining({
        action: "updated",
        reason: null,
        payload: { deadlineDate: { old: "2027-10-31", new: "2027-11-15" } },
      }),
      expect.objectContaining({
        action: "created",
        actorName: "Asha Admin",
        reason: "CA instruction 12 Oct",
        payload: {
          financialYear: "26-27",
          deadlineDate: { old: null, new: "2027-10-31" },
          defaultDate: "2027-11-30",
        },
      }),
    ]);
    const listed = await settings.listCreditNoteDeadlines();
    expect(listed.find((entry) => entry.financialYear === "26-27")?.source).toBe("configured");
  });

  it("writes nothing when the same date is saved again", async () => {
    const admin = await buildProfile();
    await settings.setCreditNoteDeadline({ financialYear: "26-27", date: "2027-10-31" }, admin.id);

    await settings.setCreditNoteDeadline({ financialYear: "26-27", date: "2027-10-31" }, admin.id);

    expect(await settings.listCreditNoteDeadlineHistory("26-27")).toHaveLength(1);
  });

  it("returns a year to the default date by saving it", async () => {
    const admin = await buildProfile();
    await settings.setCreditNoteDeadline({ financialYear: "26-27", date: "2027-10-31" }, admin.id);

    const restored = await settings.setCreditNoteDeadline(
      { financialYear: "26-27", date: "2027-11-30" },
      admin.id,
    );

    expect(restored.deadlineDate).toBe("2027-11-30");
  });

  it("refuses a date on or before 31 March of the year end, a year beyond next, and a year not in use", async () => {
    const admin = await buildProfile();

    await expect(
      settings.setCreditNoteDeadline({ financialYear: "26-27", date: "2027-03-31" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.setCreditNoteDeadline({ financialYear: "26-27", date: "2027-02-30" }, admin.id),
    ).rejects.toThrow();
    await expect(
      settings.setCreditNoteDeadline({ financialYear: "28-29", date: "2029-11-30" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      settings.setCreditNoteDeadline({ financialYear: "20-21", date: "2021-11-30" }, admin.id),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await db.select().from(gstCreditNoteDeadlinesTable)).toEqual([]);

    const nextYear = await settings.setCreditNoteDeadline(
      { financialYear: "27-28", date: "2028-04-01" },
      admin.id,
    );
    expect(nextYear.deadlineDate).toBe("2028-04-01");
  });

  it("lets a year that has ended be changed", async () => {
    const admin = await buildProfile();
    await runInTransaction((tx) =>
      numbers.ensureFinancialYear({ financialYear: "25-26", actorId: admin.id }, tx),
    );

    const changed = await settings.setCreditNoteDeadline(
      { financialYear: "25-26", date: "2026-11-20" },
      admin.id,
    );

    expect(changed).toMatchObject({ deadlineDate: "2026-11-20", source: "configured" });
  });
});
