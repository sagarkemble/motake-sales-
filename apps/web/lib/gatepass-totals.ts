interface GatepassItemQuantities {
  issuedQty: number;
  soldQty: number;
  availableQty?: number | null;
}

export interface GatepassTotals {
  totalAllocatedQty: number;
  totalSoldQty: number;
  totalRemainingQty: number;
}

export function computeGatepassTotals(items: GatepassItemQuantities[]): GatepassTotals {
  return items.reduce<GatepassTotals>(
    (totals, item) => {
      const remainingQty = item.availableQty ?? item.issuedQty - item.soldQty;
      return {
        totalAllocatedQty: totals.totalAllocatedQty + item.issuedQty,
        totalSoldQty: totals.totalSoldQty + item.soldQty,
        totalRemainingQty: totals.totalRemainingQty + remainingQty,
      };
    },
    { totalAllocatedQty: 0, totalSoldQty: 0, totalRemainingQty: 0 },
  );
}
