import { describe, expect, it } from "vitest";

import {
  balanceAdjustment,
  balanceLine,
  formatMessageDate,
  formatRupees,
  modeWord,
  normalizePhone,
  noteStatusWord,
  oneLine,
} from "./wording";

// Spec J's value formatting: pure functions, no database.

describe("formatRupees", () => {
  it("formats integer paise with en-IN grouping and two decimals, never a float", () => {
    expect(formatRupees(0)).toBe("₹0.00");
    expect(formatRupees(5)).toBe("₹0.05");
    expect(formatRupees(99)).toBe("₹0.99");
    expect(formatRupees(100)).toBe("₹1.00");
    expect(formatRupees(123_400)).toBe("₹1,234.00");
    expect(formatRupees(12_345_600)).toBe("₹1,23,456.00");
    expect(formatRupees(123_456_700)).toBe("₹12,34,567.00");
    expect(formatRupees(1_000_000_000_01)).toBe("₹1,00,00,00,000.01");
  });

  it("is unsigned: the sign is carried by the label around it", () => {
    expect(formatRupees(-20_000)).toBe("₹200.00");
  });

  it("refuses a non-integer", () => {
    expect(() => formatRupees(1.5)).toThrow();
  });
});

describe("formatMessageDate", () => {
  it("writes the month in the Customer's language with Latin digits", () => {
    expect(formatMessageDate("2026-10-28", "en")).toBe("28 October 2026");
    expect(formatMessageDate("2026-10-28", "mr")).toBe("28 ऑक्टोबर 2026");
    expect(formatMessageDate("2026-10-28", "hi")).toBe("28 अक्टूबर 2026");
    expect(formatMessageDate("2027-01-05", "mr")).toBe("5 जानेवारी 2027");
    expect(formatMessageDate("2027-02-09", "hi")).toBe("9 फ़रवरी 2027");
  });
});

describe("balanceLine", () => {
  it("picks the label by template group, language and sign (Pending when ≥ 0)", () => {
    expect(balanceLine("bill", 300_000, "en")).toBe("Pending Balance: ₹3,000.00");
    expect(balanceLine("bill", 300_000, "mr")).toBe("बिलानंतरची बाकी रक्कम: ₹3,000.00");
    expect(balanceLine("bill", -50_000, "mr")).toBe("बिलानंतरची शिल्लक आगाऊ रक्कम: ₹500.00");
    expect(balanceLine("bill", 300_000, "hi")).toBe("बिल के बाद बकाया राशि: ₹3,000.00");
    expect(balanceLine("bill", -50_000, "hi")).toBe("बिल के बाद शेष अग्रिम राशि: ₹500.00");
    expect(balanceLine("bill", -50_000, "en")).toBe("Advance Balance: ₹500.00");

    expect(balanceLine("receipt", 800_000, "mr")).toBe("बाकी रक्कम: ₹8,000.00");
    expect(balanceLine("receipt", -100, "hi")).toBe("शेष अग्रिम राशि: ₹1.00");

    expect(balanceLine("now", 280_000, "mr")).toBe("आता बाकी रक्कम: ₹2,800.00");
    expect(balanceLine("now", -280_000, "mr")).toBe("आता शिल्लक आगाऊ रक्कम: ₹2,800.00");
    expect(balanceLine("now", 280_000, "hi")).toBe("अब बकाया राशि: ₹2,800.00");
    expect(balanceLine("now", -280_000, "hi")).toBe("अब शेष अग्रिम राशि: ₹2,800.00");

    expect(balanceLine("remaining", -200_000, "en")).toBe("Remaining Advance: ₹2,000.00");
    expect(balanceLine("remaining", 0, "en")).toBe("Pending Balance: ₹0.00");
    expect(balanceLine("remaining", -200_000, "mr")).toBe("शिल्लक आगाऊ रक्कम: ₹2,000.00");
    expect(balanceLine("remaining", -200_000, "hi")).toBe("शेष अग्रिम राशि: ₹2,000.00");
  });
});

describe("words", () => {
  it("writes mode, Balance adjustment and Note status in each language", () => {
    expect([modeWord("cash", "en"), modeWord("upi", "en"), modeWord("bank", "en")]).toEqual([
      "Cash",
      "UPI",
      "Bank",
    ]);
    expect([modeWord("cash", "mr"), modeWord("upi", "mr"), modeWord("bank", "mr")]).toEqual([
      "रोख",
      "UPI",
      "बँक",
    ]);
    expect([modeWord("cash", "hi"), modeWord("upi", "hi"), modeWord("bank", "hi")]).toEqual([
      "नकद",
      "UPI",
      "बैंक",
    ]);

    expect(balanceAdjustment(-20_000, "en")).toBe("Reduced by ₹200.00");
    expect(balanceAdjustment(20_000, "en")).toBe("Increased by ₹200.00");
    expect(balanceAdjustment(-20_000, "mr")).toBe("₹200.00 ने घट");
    expect(balanceAdjustment(20_000, "mr")).toBe("₹200.00 ने वाढ");
    expect(balanceAdjustment(-20_000, "hi")).toBe("₹200.00 की कमी");
    expect(balanceAdjustment(20_000, "hi")).toBe("₹200.00 की बढ़ोतरी");

    expect(noteStatusWord("gst_credit_note", "en")).toBe("Credit Note Issued");
    expect(noteStatusWord("commercial_credit_note", "mr")).toBe("क्रेडिट नोट दिली");
    expect(noteStatusWord("debit_note", "mr")).toBe("डेबिट नोट दिली");
    expect(noteStatusWord("gst_credit_note", "hi")).toBe("क्रेडिट नोट जारी");
    expect(noteStatusWord("debit_note", "hi")).toBe("डेबिट नोट जारी");
    expect(noteStatusWord("debit_note", "en")).toBe("Debit Note Issued");
  });

  it("collapses a typed reason to one line", () => {
    expect(oneLine("  Rate\nwrong\r\n\tat   entry  ")).toBe("Rate wrong at entry");
  });
});

describe("normalizePhone", () => {
  it("accepts the forms phones are typed in and returns +91 and 10 digits", () => {
    for (const phone of [
      "9822418224",
      "+91 98224 18224",
      "09822418224",
      "919822418224",
      "+91-98224-18224",
      "(+91) 98224 18224",
    ]) {
      expect(normalizePhone(phone)).toEqual({ to: "+919822418224" });
    }
    expect(normalizePhone("6000000000")).toEqual({ to: "+916000000000" });
  });

  it("gives a skip reason for anything else", () => {
    expect(normalizePhone("")).toEqual({ to: null, skipReason: "missing phone" });
    expect(normalizePhone("   ")).toEqual({ to: null, skipReason: "missing phone" });
    expect(normalizePhone(null)).toEqual({ to: null, skipReason: "missing phone" });
    expect(normalizePhone("982241822")).toEqual({
      to: null,
      skipReason: "not a valid Indian mobile",
    });
    expect(normalizePhone("5822418224")).toEqual({
      to: null,
      skipReason: "not a valid Indian mobile",
    });
    expect(normalizePhone("+44 7700 900123")).toEqual({
      to: null,
      skipReason: "not a valid Indian mobile",
    });
  });
});
