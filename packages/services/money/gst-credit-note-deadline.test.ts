import { db } from "@repo/database";
import { gstCreditNoteDeadlinesTable } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

import { buildProfile } from "../test/builders";
import { GstCreditNoteDeadlineService } from "./gst-credit-note-deadline";

const deadlineService = new GstCreditNoteDeadlineService();

describe("GST Credit Note deadline", () => {
  it("defaults to 30 November after the financial year ends, without inserting a row", async () => {
    expect(await deadlineService.getDeadline("26-27")).toEqual({
      deadlineDate: "2027-11-30",
      source: "default",
    });
    expect(await db.select().from(gstCreditNoteDeadlinesTable)).toEqual([]);
  });

  it("uses the configured deadline over the default", async () => {
    const admin = await buildProfile();
    await db
      .insert(gstCreditNoteDeadlinesTable)
      .values({ financialYear: "25-26", deadlineDate: "2026-10-20", updatedBy: admin.id });

    expect(await deadlineService.getDeadline("25-26")).toEqual({
      deadlineDate: "2026-10-20",
      source: "configured",
    });
  });

  it("allows a GST Credit Note on the deadline day and refuses it the day after", async () => {
    const onDeadline = await deadlineService.isGstCreditNoteAllowed({
      billDate: "2026-06-10",
      onDate: "2027-11-30",
    });
    const dayAfter = await deadlineService.isGstCreditNoteAllowed({
      billDate: "2026-06-10",
      onDate: "2027-12-01",
    });

    expect(onDeadline).toEqual({ allowed: true, deadlineDate: "2027-11-30", source: "default" });
    expect(dayAfter.allowed).toBe(false);
  });

  it("uses the Bill's financial year, so a March Bill and an April Bill differ", async () => {
    const marchBill = await deadlineService.isGstCreditNoteAllowed({
      billDate: "2027-03-31",
      onDate: "2027-12-01",
    });
    const aprilBill = await deadlineService.isGstCreditNoteAllowed({
      billDate: "2027-04-01",
      onDate: "2027-12-01",
    });

    expect(marchBill).toMatchObject({ allowed: false, deadlineDate: "2027-11-30" });
    expect(aprilBill).toMatchObject({ allowed: true, deadlineDate: "2028-11-30" });
  });
});
