"use client";

import type { GatepassStatus } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";

import { isHandedOver, type GatepassQuantityTotals } from "~/lib/gatepass-quantities";

interface GatepassStatGridProps {
  totals: GatepassQuantityTotals;
  status: GatepassStatus;
}

export function GatepassStatGrid({ totals, status }: GatepassStatGridProps) {
  const tx = useTranslate();
  const stats = [
    { label: "salesman.gatepass.col.issued", value: totals.issued },
    { label: "salesman.gatepass.col.sold", value: totals.sold },
    { label: "salesman.gatepass.stat.leftToSell", value: totals.left },
    {
      label: "salesman.gatepass.col.returned",
      value: isHandedOver(status) ? totals.returned : null,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-[11px] leading-tight text-muted-foreground">{tx(stat.label)}</p>
          <p className="text-lg font-semibold tabular-nums">{stat.value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}
