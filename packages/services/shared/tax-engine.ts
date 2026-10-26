import type { SelectBill } from "@repo/database/schema";

// GST on Route prices (ADR-0002, route-pricing §5). Pure: no database, no floats. Shared by
// checkout quotes, Bill issue and (Spec G) Raise Bill and Correct.

export type PlaceOfSupply = "intra_state" | "inter_state";
export type LegalType = SelectBill["legalType"];

export interface TaxLineInput {
  quantity: number;
  // Tax-exclusive, per pack.
  routePricePaise: number;
  exempt: boolean;
  // 5% is 500.
  gstRateBps: number;
}

export interface LineTax {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface BillTax<Line extends TaxLineInput> {
  lines: Array<Line & LineTax>;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  grossPaise: number;
  // Gross rounded half-up to the rupee.
  totalPaise: number;
  // Signed, total minus gross: -49 to +50.
  roundOffPaise: number;
  totalQuantity: number;
  legalType: LegalType;
}

// Exact equality of the two official state names (one shared list); no trimming or case folding.
export function placeOfSupplyOf(deliveryState: string, sellerState: string): PlaceOfSupply {
  return deliveryState === sellerState ? "intra_state" : "inter_state";
}

// Half-up for non-negative n and positive d: floor((2n + d) / 2d).
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

function toSafeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Amount ${value} is too large`);
  return result;
}

function taxLine(line: TaxLineInput, placeOfSupply: PlaceOfSupply): LineTax {
  const taxable = BigInt(line.routePricePaise) * BigInt(line.quantity);
  const taxablePaise = toSafeNumber(taxable);
  if (line.exempt) return { taxablePaise, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
  const taxed = taxable * BigInt(line.gstRateBps);
  if (placeOfSupply === "intra_state") {
    // Each half rounded on its own, so CGST always equals SGST.
    const halfPaise = toSafeNumber(divideHalfUp(taxed, 20_000n));
    return { taxablePaise, cgstPaise: halfPaise, sgstPaise: halfPaise, igstPaise: 0 };
  }
  return {
    taxablePaise,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: toSafeNumber(divideHalfUp(taxed, 10_000n)),
  };
}

export function computeBillTax<Line extends TaxLineInput>(
  lines: Line[],
  placeOfSupply: PlaceOfSupply,
): BillTax<Line> {
  const taxedLines = lines.map((line) => ({ ...line, ...taxLine(line, placeOfSupply) }));
  const sum = (pick: (line: LineTax & TaxLineInput) => number) =>
    taxedLines.reduce((total, line) => total + BigInt(pick(line)), 0n);
  const taxable = sum((line) => line.taxablePaise);
  const cgst = sum((line) => line.cgstPaise);
  const sgst = sum((line) => line.sgstPaise);
  const igst = sum((line) => line.igstPaise);
  const gross = taxable + cgst + sgst + igst;
  const total = divideHalfUp(gross, 100n) * 100n;
  return {
    lines: taxedLines,
    taxablePaise: toSafeNumber(taxable),
    cgstPaise: toSafeNumber(cgst),
    sgstPaise: toSafeNumber(sgst),
    igstPaise: toSafeNumber(igst),
    grossPaise: toSafeNumber(gross),
    totalPaise: toSafeNumber(total),
    roundOffPaise: toSafeNumber(total - gross),
    totalQuantity: toSafeNumber(sum((line) => line.quantity)),
    legalType: lines.some((line) => !line.exempt) ? "tax_invoice" : "bill_of_supply",
  };
}
