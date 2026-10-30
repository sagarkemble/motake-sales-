import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { recordSaleInputSchema } from "../gatepass/model";
import { addPaymentInputSchema } from "../payments/model";
import { setRoutePriceInputSchema } from "../routes/model";
import { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE, MAX_QTY, QTY_TOO_LARGE } from "./limits";

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((issue) => issue.message);
}

describe("number limits", () => {
  const payment = (keptPaise: number) => ({
    customerId: randomUUID(),
    mode: "cash" as const,
    keptPaise,
    reason: "Paid at the office",
    idempotencyKey: randomUUID(),
  });

  it("takes an amount up to ₹50,00,000 and refuses one paisa more as amount_too_large", () => {
    expect(addPaymentInputSchema.safeParse(payment(MAX_AMOUNT_PAISE)).success).toBe(true);
    expect(issueMessages(addPaymentInputSchema.safeParse(payment(MAX_AMOUNT_PAISE + 1)))).toEqual([
      AMOUNT_TOO_LARGE,
    ]);
    const price = { routeId: randomUUID(), varietyId: randomUUID() };
    expect(
      issueMessages(
        setRoutePriceInputSchema.safeParse({ ...price, pricePaise: MAX_AMOUNT_PAISE + 1 }),
      ),
    ).toEqual([AMOUNT_TOO_LARGE]);
  });

  it("takes a qty up to 5,000 and refuses one more as qty_too_large", () => {
    const sale = (quantity: number) => ({ gatepassItemId: randomUUID(), quantity });
    expect(recordSaleInputSchema.safeParse(sale(MAX_QTY)).success).toBe(true);
    expect(issueMessages(recordSaleInputSchema.safeParse(sale(MAX_QTY + 1)))).toEqual([
      QTY_TOO_LARGE,
    ]);
  });
});
