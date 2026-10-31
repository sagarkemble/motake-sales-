// The largest amount and quantity one entry may carry: ₹50,00,000 and 5,000 packs. Far above a
// real day's business, so a value past them is a typo (an extra zero), not a sale.
export const MAX_AMOUNT_PAISE = 500_000_000;
export const MAX_QTY = 5_000;

// The validation issue messages for a value past a limit; the web shows its own words for each.
export const AMOUNT_TOO_LARGE = "amount_too_large";
export const QTY_TOO_LARGE = "qty_too_large";
