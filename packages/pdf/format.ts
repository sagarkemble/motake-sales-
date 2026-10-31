// Printing helpers. Money arrives as integer paise and every step here stays in integer maths, so
// the paper matches the WhatsApp text to the paisa. Dates arrive as `YYYY-MM-DD` (Asia/Kolkata).

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertWholePaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) throw new Error(`Money must be whole paise, got ${paise}`);
}

// Exact for safe integers: the dividend is a multiple of the divisor before dividing.
function wholeDivide(dividend: number, divisor: number): number {
  return (dividend - (dividend % divisor)) / divisor;
}

// en-IN grouping: the last three digits, then pairs (1,23,45,678).
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${head},${digits.slice(-3)}`;
}

// `₹1,23,456.00`; a negative amount prints as `-₹12.50`.
export function formatPaise(paise: number): string {
  assertWholePaise(paise);
  const absolute = Math.abs(paise);
  const rupees = groupIndian(String(wholeDivide(absolute, 100)));
  const paiseDigits = String(absolute % 100).padStart(2, "0");
  return `${paise < 0 ? "-" : ""}₹${rupees}.${paiseDigits}`;
}

// Round-off carries its sign either way: `+₹0.40`, `-₹0.40`, `₹0.00`.
export function formatSignedPaise(paise: number): string {
  return paise > 0 ? `+${formatPaise(paise)}` : formatPaise(paise);
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value]!;
  const unit = value % 10;
  return [TENS[wholeDivide(value, 10)]!, unit > 0 ? ONES[unit]! : ""].filter(Boolean).join(" ");
}

function belowThousand(value: number): string {
  const hundreds = wholeDivide(value, 100);
  const rest = value % 100;
  return [hundreds > 0 ? `${ONES[hundreds]} Hundred` : "", rest > 0 ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

// Indian numbering: crore, lakh, thousand, hundred. Above 99 crore the crore count is itself read
// in Indian numbering ("One Hundred Crore", "One Lakh Crore").
function indianWords(value: number): string {
  const crores = wholeDivide(value, 10_000_000);
  const belowCrore = value % 10_000_000;
  const lakhs = wholeDivide(belowCrore, 100_000);
  const thousands = wholeDivide(belowCrore % 100_000, 1_000);
  const rest = belowCrore % 1_000;
  return [
    crores > 0 ? `${indianWords(crores)} Crore` : "",
    lakhs > 0 ? `${belowHundred(lakhs)} Lakh` : "",
    thousands > 0 ? `${belowHundred(thousands)} Thousand` : "",
    rest > 0 ? belowThousand(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Twelve Paise Only".
export function amountInWords(paise: number): string {
  assertWholePaise(paise);
  if (paise < 0) throw new Error(`Amount in words needs a positive amount, got ${paise}`);
  const rupees = wholeDivide(paise, 100);
  const paisePart = paise % 100;
  const rupeeWords = rupees > 0 ? indianWords(rupees) : "Zero";
  if (paisePart === 0) return `Rupees ${rupeeWords} Only`;
  return `Rupees ${rupeeWords} and ${belowHundred(paisePart)} Paise Only`;
}

// `2026-10-25` prints as `25/10/2026`.
export function formatDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) throw new Error(`Dates must be YYYY-MM-DD, got ${isoDate}`);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

// GST rates are stored in basis points: 500 prints as `5%`, 250 as `2.5%`.
export function formatRateBps(bps: number): string {
  const whole = wholeDivide(bps, 100);
  const fraction = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

// Above zero the Customer owes Motake (Pending); below zero Motake owes the Customer (Advance).
export function balanceWording(balancePaise: number): string {
  if (balancePaise > 0) return `Pending ${formatPaise(balancePaise)}`;
  if (balancePaise < 0) return `Advance ${formatPaise(-balancePaise)}`;
  return "Settled";
}
