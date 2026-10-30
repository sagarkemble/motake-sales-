// Typed rupee prices ↔ integer paise, by string parsing only (no floating point).

import { MAX_AMOUNT_PAISE } from "@repo/trpc/client";

const RUPEE_INPUT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

// Any typed amount above ₹0, with no upper limit.
function parseAnyRupees(rawInput: string): number | null {
  const normalizedInput = rawInput.trim().replace(/[₹,\s]/g, "");
  const match = RUPEE_INPUT_PATTERN.exec(normalizedInput);
  if (!match) return null;
  const [, wholeRupees = "", fraction = ""] = match;
  const paise = Number(wholeRupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/**
 * "1,234.5" → 123450. Null for empty, zero, negative, non-numeric, more than two decimals or above
 * ₹50,00,000 (MAX_AMOUNT_PAISE).
 */
export function parseRupeesToPaise(rawInput: string): number | null {
  const paise = parseAnyRupees(rawInput);
  return paise != null && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

/** True when the field holds a well-formed amount above ₹50,00,000. */
export function isAmountTooLarge(rawInput: string): boolean {
  const paise = parseAnyRupees(rawInput);
  return paise != null && paise > MAX_AMOUNT_PAISE;
}

/** 123450 → "1234.50", for a rupee input field. */
export function paiseToRupeeInput(paise: number): string {
  const wholeRupees = Math.floor(paise / 100);
  const remainingPaise = String(paise % 100).padStart(2, "0");
  return `${wholeRupees}.${remainingPaise}`;
}

/** Keeps what a rupee field may hold while typing: digits and one "." with up to two decimals. */
export function keepRupeeInputCharacters(rawInput: string): string {
  const [wholeRupees = "", ...rest] = rawInput.replace(/[^\d.]/g, "").split(".");
  return rest.length === 0 ? wholeRupees : `${wholeRupees}.${rest.join("").slice(0, 2)}`;
}
