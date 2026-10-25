import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { describe, expect, it } from "vitest";

import { financialYearBounds, financialYearOf, financialYearOfInstant } from "./financial-year";

describe("financial year", () => {
  it.each([
    ["2026-04-01", "26-27"],
    ["2027-03-31", "26-27"],
    ["2027-01-15", "26-27"],
    ["2026-03-31", "25-26"],
    ["2099-04-01", "99-00"],
    ["2100-02-01", "99-00"],
    ["2000-01-10", "99-00"],
    ["2000-04-10", "00-01"],
  ])("labels the IST date %s as %s", (date, financialYear) => {
    expect(financialYearOf(date)).toBe(financialYear);
  });

  it("takes the year from the Asia/Kolkata date, not UTC", () => {
    // 31 March 23:59 IST and 1 April 00:00 IST.
    expect(financialYearOfInstant(new Date("2027-03-31T18:29:00Z"))).toBe("26-27");
    expect(financialYearOfInstant(new Date("2027-03-31T18:30:00Z"))).toBe("27-28");
    expect(businessDateOf(new Date("2027-03-31T18:30:00Z"))).toBe("2027-04-01");
  });

  it("gives the first and last day of a financial year", () => {
    expect(financialYearBounds("26-27")).toEqual({ firstDay: "2026-04-01", lastDay: "2027-03-31" });
    expect(financialYearBounds("99-00")).toEqual({ firstDay: "2099-04-01", lastDay: "2100-03-31" });
  });

  it("refuses a label that is not two consecutive years", () => {
    expect(() => financialYearBounds("26-28")).toThrow();
    expect(() => financialYearBounds("2026-27")).toThrow();
  });
});
