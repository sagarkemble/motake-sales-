import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { z } from "zod";

const FINANCIAL_YEAR_PATTERN = /^(\d{2})-(\d{2})$/;

const twoDigits = (year: number) => String(year % 100).padStart(2, "0");

// Labels are two-digit and read as 20YY, so only financial years 00-01 (from 1 April 2000) to
// 99-00 (to 31 March 2100) exist; a date outside them is refused rather than given a label that
// means another century.
const FIRST_START_YEAR = 2000;
const LAST_START_YEAR = 2099;

// `YY-YY`, April to March, from an Asia/Kolkata calendar date `YYYY-MM-DD`.
export function financialYearOf(businessDate: string): string {
  const year = Number(businessDate.slice(0, 4));
  const month = Number(businessDate.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  if (startYear < FIRST_START_YEAR || startYear > LAST_START_YEAR) {
    throw new Error(`${businessDate} is outside the financial years 00-01 to 99-00`);
  }
  return `${twoDigits(startYear)}-${twoDigits(startYear + 1)}`;
}

export function financialYearOfInstant(instant: Date): string {
  return financialYearOf(businessDateOf(instant));
}

function startYearOf(financialYear: string): number | undefined {
  const match = FINANCIAL_YEAR_PATTERN.exec(financialYear);
  const start = Number(match?.[1]);
  const end = Number(match?.[2]);
  if (!match || (start + 1) % 100 !== end) return undefined;
  return FIRST_START_YEAR + start;
}

export const financialYearSchema = z
  .string()
  .refine((label) => startYearOf(label) !== undefined, "Not a financial year label");

export function financialYearBounds(financialYear: string): { firstDay: string; lastDay: string } {
  const startYear = startYearOf(financialYear);
  if (startYear === undefined) throw new Error(`Not a financial year label: ${financialYear}`);
  return { firstDay: `${startYear}-04-01`, lastDay: `${startYear + 1}-03-31` };
}
