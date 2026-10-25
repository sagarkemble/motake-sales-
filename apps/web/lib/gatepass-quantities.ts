import type { GatepassShortReason, GatepassStatus } from "~/hooks/use-gatepasses";

/** A GatePass line ready to show: the Variety's names plus the four quantities. */
export interface GatepassLine {
  id: string;
  productName: string;
  varietyName: string;
  unit: string;
  issuedQty: number;
  soldQty: number;
  // Left to sell: issued − sold. Returned never changes it.
  sellableQty: number;
  returnedQty: number;
  shortReason: GatepassShortReason | null;
  shortNote: string | null;
}

interface LineQuantities {
  issuedQty: number;
  soldQty: number;
  sellableQty: number;
  returnedQty: number;
}

export interface GatepassQuantityTotals {
  issued: number;
  sold: number;
  left: number;
  returned: number;
  short: number;
}

export const SHORT_REASON_LABEL_KEYS: Record<GatepassShortReason, string> = {
  damaged: "salesman.handover.reason.damaged",
  expired: "salesman.handover.reason.expired",
  lost: "salesman.handover.reason.lost",
  leaked: "salesman.handover.reason.leaked",
  other: "salesman.handover.reason.other",
};

/** Returned and short only mean something once the salesman has handed over. */
export function isHandedOver(status: GatepassStatus | undefined): boolean {
  return status === "pending_verification" || status === "closed";
}

/** Units left to sell that did not come back at handover. Read it only once handed over. */
export function shortQtyOf(line: LineQuantities): number {
  return Math.max(line.sellableQty - line.returnedQty, 0);
}

export function sumGatepassQuantities(lines: LineQuantities[]): GatepassQuantityTotals {
  return lines.reduce<GatepassQuantityTotals>(
    (totals, line) => ({
      issued: totals.issued + line.issuedQty,
      sold: totals.sold + line.soldQty,
      left: totals.left + line.sellableQty,
      returned: totals.returned + line.returnedQty,
      short: totals.short + shortQtyOf(line),
    }),
    { issued: 0, sold: 0, left: 0, returned: 0, short: 0 },
  );
}
