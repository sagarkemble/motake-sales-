// Typed rupee prices ↔ integer paise, by string parsing only (no floating point).

const RUPEE_INPUT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/** "1,234.5" → 123450. Null for empty, zero, negative, non-numeric or more than two decimals. */
export function parseRupeesToPaise(rawInput: string): number | null {
  const normalizedInput = rawInput.trim().replace(/[₹,\s]/g, "");
  const match = RUPEE_INPUT_PATTERN.exec(normalizedInput);
  if (!match) return null;
  const [, wholeRupees = "", fraction = ""] = match;
  const paise = Number(wholeRupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** 123450 → "1234.50", for a rupee input field. */
export function paiseToRupeeInput(paise: number): string {
  const wholeRupees = Math.floor(paise / 100);
  const remainingPaise = String(paise % 100).padStart(2, "0");
  return `${wholeRupees}.${remainingPaise}`;
}
