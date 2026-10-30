import type { SelectNote } from "@repo/database/schema";

import type { PaymentMode } from "../payments";
import type { MessageLanguage } from "./model";

// The one server-side place that writes money, dates and labels for a Customer message (Spec J).
// Labels around the values are template text in Meta; these are only the values. Digits are Latin
// in every language.

const RUPEE = "₹";

// Unsigned, from integer paise without floats: ₹1,23,456.00 (en-IN grouping, two decimals).
export function formatRupees(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new Error(`Paise must be an integer, got ${paise}`);
  const digits = String(Math.abs(paise)).padStart(3, "0");
  const rupees = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  const lastThree = rupees.slice(-3);
  const leading = rupees.slice(0, -3);
  const grouped = leading ? `${leading.replace(/\B(?=(\d{2})+$)/g, ",")},${lastThree}` : lastThree;
  return `${RUPEE}${grouped}.${fraction}`;
}

const MONTH_NAMES: Record<MessageLanguage, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  mr: [
    "जानेवारी",
    "फेब्रुवारी",
    "मार्च",
    "एप्रिल",
    "मे",
    "जून",
    "जुलै",
    "ऑगस्ट",
    "सप्टेंबर",
    "ऑक्टोबर",
    "नोव्हेंबर",
    "डिसेंबर",
  ],
  hi: [
    "जनवरी",
    "फ़रवरी",
    "मार्च",
    "अप्रैल",
    "मई",
    "जून",
    "जुलाई",
    "अगस्त",
    "सितंबर",
    "अक्टूबर",
    "नवंबर",
    "दिसंबर",
  ],
};

// A YYYY-MM-DD business date as `28 October 2026`, the month in the Customer's language.
export function formatMessageDate(day: string, language: MessageLanguage): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`Not a calendar date: ${day}`);
  const [, year, month, date] = match;
  return `${Number(date)} ${MONTH_NAMES[language][Number(month) - 1]} ${year}`;
}

// Which label set a template's `balance_line` uses.
export type BalanceLineGroup = "bill" | "receipt" | "now" | "remaining";

// [Pending (Balance ≥ 0), Advance (Balance < 0)] per group and language.
const BALANCE_LABELS: Record<
  BalanceLineGroup,
  Record<MessageLanguage, readonly [string, string]>
> = {
  bill: {
    en: ["Pending Balance", "Advance Balance"],
    mr: ["बिलानंतरची बाकी रक्कम", "बिलानंतरची शिल्लक आगाऊ रक्कम"],
    hi: ["बिल के बाद बकाया राशि", "बिल के बाद शेष अग्रिम राशि"],
  },
  receipt: {
    en: ["Pending Balance", "Advance Balance"],
    mr: ["बाकी रक्कम", "शिल्लक आगाऊ रक्कम"],
    hi: ["बकाया राशि", "शेष अग्रिम राशि"],
  },
  now: {
    en: ["Pending Balance", "Advance Balance"],
    mr: ["आता बाकी रक्कम", "आता शिल्लक आगाऊ रक्कम"],
    hi: ["अब बकाया राशि", "अब शेष अग्रिम राशि"],
  },
  remaining: {
    en: ["Pending Balance", "Remaining Advance"],
    mr: ["बाकी रक्कम", "शिल्लक आगाऊ रक्कम"],
    hi: ["बकाया राशि", "शेष अग्रिम राशि"],
  },
};

// The whole line, label included: `Pending Balance: ₹3,000.00`.
export function balanceLine(
  group: BalanceLineGroup,
  balancePaise: number,
  language: MessageLanguage,
): string {
  const [pending, advance] = BALANCE_LABELS[group][language];
  return `${balancePaise >= 0 ? pending : advance}: ${formatRupees(balancePaise)}`;
}

const MODE_WORDS: Record<MessageLanguage, Record<PaymentMode, string>> = {
  en: { cash: "Cash", upi: "UPI", bank: "Bank" },
  mr: { cash: "रोख", upi: "UPI", bank: "बँक" },
  hi: { cash: "नकद", upi: "UPI", bank: "बैंक" },
};

export function modeWord(mode: PaymentMode, language: MessageLanguage): string {
  return MODE_WORDS[language][mode];
}

// A signed Balance change as words around the unsigned amount: `Reduced by ₹200.00`.
export function balanceAdjustment(differencePaise: number, language: MessageLanguage): string {
  const amount = formatRupees(differencePaise);
  const reduced = differencePaise < 0;
  switch (language) {
    case "en":
      return reduced ? `Reduced by ${amount}` : `Increased by ${amount}`;
    case "mr":
      return reduced ? `${amount} ने घट` : `${amount} ने वाढ`;
    case "hi":
      return reduced ? `${amount} की कमी` : `${amount} की बढ़ोतरी`;
  }
}

const NOTE_STATUS_WORDS: Record<MessageLanguage, { credit: string; debit: string }> = {
  en: { credit: "Credit Note Issued", debit: "Debit Note Issued" },
  mr: { credit: "क्रेडिट नोट दिली", debit: "डेबिट नोट दिली" },
  hi: { credit: "क्रेडिट नोट जारी", debit: "डेबिट नोट जारी" },
};

// GST and Commercial Credit Notes are both Credit Notes to the Customer.
export function noteStatusWord(kind: SelectNote["kind"], language: MessageLanguage): string {
  const words = NOTE_STATUS_WORDS[language];
  return kind === "debit_note" ? words.debit : words.credit;
}

// Template values are one line: newlines, tabs and runs of spaces become one space.
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export type NormalizedPhone = { to: string } | { to: null; skipReason: string };

export const MISSING_PHONE = "missing phone";
export const NOT_INDIAN_MOBILE = "not a valid Indian mobile";

// `+91` + 10 digits starting 6–9, from the forms Customers' phones are typed in: +91 / 91 / 0
// prefix or none, with spaces, dashes or brackets. Anything else is a skip reason, never an error.
export function normalizePhone(phone: string | null | undefined): NormalizedPhone {
  const compact = (phone ?? "").replace(/[\s\-()]/g, "");
  if (compact.length === 0) return { to: null, skipReason: MISSING_PHONE };
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? { to: `+91${match[1]}` } : { to: null, skipReason: NOT_INDIAN_MOBILE };
}
