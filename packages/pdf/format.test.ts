import { describe, expect, it } from "vitest";

import {
  amountInWords,
  balanceWording,
  documentFileName,
  draftBillFileName,
  formatDate,
  formatPaise,
  formatRateBps,
  formatSignedPaise,
} from "./index";

describe("money format", () => {
  it("prints paise as rupees with en-IN grouping and two decimals", () => {
    expect(formatPaise(12_345_600)).toBe("₹1,23,456.00");
    expect(formatPaise(12_345_678_912)).toBe("₹12,34,56,789.12");
    expect(formatPaise(5)).toBe("₹0.05");
    expect(formatPaise(99_900)).toBe("₹999.00");
    expect(formatPaise(-1_250)).toBe("-₹12.50");
  });

  it("signs a round-off either way", () => {
    expect(formatSignedPaise(40)).toBe("+₹0.40");
    expect(formatSignedPaise(-40)).toBe("-₹0.40");
    expect(formatSignedPaise(0)).toBe("₹0.00");
  });

  it("refuses money that is not whole paise", () => {
    expect(() => formatPaise(10.5)).toThrow(/whole paise/);
  });
});

describe("amount in words", () => {
  it("reads rupees and paise in Indian numbering", () => {
    expect(amountInWords(12_345_612)).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Twelve Paise Only",
    );
    expect(amountInWords(551_800)).toBe("Rupees Five Thousand Five Hundred Eighteen Only");
    expect(amountInWords(50)).toBe("Rupees Zero and Fifty Paise Only");
  });

  it("reads lakh and crore amounts", () => {
    expect(amountInWords(10_000_000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(1_234_567_890)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paise Only",
    );
    expect(amountInWords(100_000_000_000)).toBe("Rupees One Hundred Crore Only");
  });
});

describe("dates, rates and Balance wording", () => {
  it("prints dates as dd/mm/yyyy", () => {
    expect(formatDate("2026-10-05")).toBe("05/10/2026");
  });

  it("prints GST rates from basis points", () => {
    expect(formatRateBps(500)).toBe("5%");
    expect(formatRateBps(250)).toBe("2.5%");
    expect(formatRateBps(1_800)).toBe("18%");
    expect(formatRateBps(0)).toBe("0%");
  });

  it("words the Balance as Pending, Advance or Settled", () => {
    expect(balanceWording(125_050)).toBe("Pending ₹1,250.50");
    expect(balanceWording(-20_000)).toBe("Advance ₹200.00");
    expect(balanceWording(0)).toBe("Settled");
  });
});

describe("file names", () => {
  it("names each paper with its number, slashes replaced", () => {
    expect(documentFileName("tax_invoice", "MB/26-27/000123")).toBe(
      "Motake Bill MB-26-27-000123.pdf",
    );
    expect(documentFileName("bill_of_supply", "MB/26-27/000124")).toBe(
      "Motake Bill MB-26-27-000124.pdf",
    );
    expect(documentFileName("gst_credit_note", "MC/26-27/000045")).toBe(
      "Motake Credit Note MC-26-27-000045.pdf",
    );
    expect(documentFileName("commercial_credit_note", "MC/26-27/000046")).toBe(
      "Motake Credit Note MC-26-27-000046.pdf",
    );
    expect(documentFileName("debit_note", "MD/26-27/000007")).toBe(
      "Motake Debit Note MD-26-27-000007.pdf",
    );
    expect(documentFileName("payment_receipt", "MP/26-27/000010")).toBe(
      "Motake Receipt MP-26-27-000010.pdf",
    );
  });

  it("marks the draft Bill file name", () => {
    expect(draftBillFileName("MB/26-27/000123")).toBe(
      "Motake Bill MB-26-27-000123 DRAFT-IRN-PENDING.pdf",
    );
  });
});
