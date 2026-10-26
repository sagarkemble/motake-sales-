// GST rates cross the API as integer basis points: 5% is 500, 2.5% is 250.

/** "2.5" → 250, by string parsing. Undefined unless it is a percent with at most two decimals. */
export function percentToBps(input: string): number | undefined {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return undefined;
  const [, whole = "0", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 250 → "2.5", for an input field. */
export function bpsToPercent(gstRateBps: number): string {
  const whole = Math.floor(gstRateBps / 100);
  const fraction = String(gstRateBps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
