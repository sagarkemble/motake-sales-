/** Format INR amounts for Motake UI (e.g. ₹1,140.00). */
export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact INR for KPI cards (e.g. ₹48,260). */
export function formatInrCompact(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function lineTotal(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * quantity * 100) / 100;
}
