import { describe, expect, it } from "vitest";

import { computeBillTax, placeOfSupplyOf, type TaxLineInput } from "./tax-engine";

const taxable = (routePricePaise: number, quantity = 1, gstRateBps = 500): TaxLineInput => ({
  routePricePaise,
  quantity,
  exempt: false,
  gstRateBps,
});

const exempt = (routePricePaise: number, quantity = 1): TaxLineInput => ({
  routePricePaise,
  quantity,
  exempt: true,
  gstRateBps: 0,
});

describe("tax engine", () => {
  it.each([
    // 100 paise at 1% intra: each half is exactly 0.5 paise and rounds up.
    ["intra_state", 100, 100, { cgstPaise: 1, sgstPaise: 1, igstPaise: 0 }],
    // 100 paise at 0.5% inter: exactly 0.5 paise rounds up.
    ["inter_state", 100, 50, { cgstPaise: 0, sgstPaise: 0, igstPaise: 1 }],
    // Just under half rounds down: 99 paise at 1% intra is 0.495 per half.
    ["intra_state", 99, 100, { cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }],
  ] as const)("rounds half-up per line (%s, %i paise at %i bps)", (pos, price, bps, tax) => {
    const result = computeBillTax([taxable(price, 1, bps)], pos);
    expect(result.lines[0]).toMatchObject({ taxablePaise: price, ...tax });
  });

  it("rounds each half on its own for an odd rate, so CGST equals SGST", () => {
    // 10,000 paise at 25 bps: 12.5 paise per half → 13 each; IGST would be exactly 25.
    const intra = computeBillTax([taxable(10_000, 1, 25)], "intra_state");
    expect(intra.lines[0]).toMatchObject({ cgstPaise: 13, sgstPaise: 13, igstPaise: 0 });
    const inter = computeBillTax([taxable(10_000, 1, 25)], "inter_state");
    expect(inter.lines[0]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 25 });
  });

  it("taxes intra-state as CGST + SGST and inter-state as IGST, summed per Bill", () => {
    const lines = [taxable(2_500, 4, 500), taxable(1_000, 3, 1_200)];
    const intra = computeBillTax(lines, "intra_state");
    // 10,000 at 5% → 250 + 250; 3,000 at 12% → 180 + 180.
    expect(intra).toMatchObject({
      taxablePaise: 13_000,
      cgstPaise: 430,
      sgstPaise: 430,
      igstPaise: 0,
      grossPaise: 13_860,
      totalPaise: 13_900,
      roundOffPaise: 40,
      totalQuantity: 7,
      legalType: "tax_invoice",
    });
    const inter = computeBillTax(lines, "inter_state");
    expect(inter).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 860, totalPaise: 13_900 });
  });

  it("makes an all-exempt Bill a Bill of Supply with no tax, and a mixed one a Tax Invoice", () => {
    const allExempt = computeBillTax([exempt(5_000, 2), exempt(1_234)], "intra_state");
    expect(allExempt).toMatchObject({
      taxablePaise: 11_234,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      legalType: "bill_of_supply",
    });
    const mixed = computeBillTax([exempt(5_000), taxable(5_000)], "inter_state");
    expect(mixed.legalType).toBe("tax_invoice");
    expect(mixed.lines[0]).toMatchObject({ cgstPaise: 0, sgstPaise: 0, igstPaise: 0 });
  });

  it.each([
    [12_345, 12_300, -45],
    [12_349, 12_300, -49],
    [12_350, 12_400, 50],
    [12_351, 12_400, 49],
    [12_300, 12_300, 0],
  ])("rounds gross %i paise half-up to %i with round-off %i", (gross, total, roundOff) => {
    const result = computeBillTax([exempt(gross)], "intra_state");
    expect(result).toMatchObject({ grossPaise: gross, totalPaise: total, roundOffPaise: roundOff });
  });

  it("keeps large amounts exact with no float drift", () => {
    // 99,999,999 paise × 90,000 packs at 28%: taxable × bps passes 2^53, so it needs big integers.
    const result = computeBillTax([taxable(99_999_999, 90_000, 2_800)], "intra_state");
    const taxablePaise = 99_999_999 * 90_000;
    expect(result.taxablePaise).toBe(taxablePaise);
    expect(result.cgstPaise).toBe(Number((BigInt(taxablePaise) * 2_800n * 2n + 20_000n) / 40_000n));
    expect(result.cgstPaise).toBe(1_259_999_987_400);
    expect(result.sgstPaise).toBe(result.cgstPaise);
    expect(result.grossPaise).toBe(taxablePaise + 2 * result.cgstPaise);
    expect(Number.isSafeInteger(result.totalPaise)).toBe(true);
  });

  it("is intra-state only when the two official state names are exactly equal", () => {
    expect(placeOfSupplyOf("Maharashtra", "Maharashtra")).toBe("intra_state");
    expect(placeOfSupplyOf("Karnataka", "Maharashtra")).toBe("inter_state");
    expect(placeOfSupplyOf("maharashtra", "Maharashtra")).toBe("inter_state");
    expect(placeOfSupplyOf("Maharashtra ", "Maharashtra")).toBe("inter_state");
  });
});
