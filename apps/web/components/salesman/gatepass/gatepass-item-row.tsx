"use client";

import { PackageIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

import type { GatepassLine } from "~/lib/gatepass-quantities";

interface GatepassItemRowProps {
  line: GatepassLine;
  handedOver: boolean;
}

export function GatepassItemRow({ line, handedOver }: GatepassItemRowProps) {
  const tx = useTranslate();
  const quantities = [
    { label: "salesman.gatepass.col.issued", value: line.issuedQty },
    { label: "salesman.gatepass.col.sold", value: line.soldQty },
    { label: "salesman.gatepass.col.left", value: line.sellableQty, isLeft: true },
    { label: "salesman.gatepass.col.returnedShort", value: handedOver ? line.returnedQty : null },
  ];

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
        <PackageIcon className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.productName}</p>
        <p className="truncate text-xs text-muted-foreground">{line.varietyName}</p>
        {line.sellableQty === 0 && (
          <Badge
            variant="outline"
            className="mt-1 border-transparent bg-brand/10 text-[10px] text-brand"
          >
            {tx("salesman.gatepass.soldOut")}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2.5 text-right text-xs tabular-nums">
        {quantities.map((quantity) => (
          <div key={quantity.label}>
            <p className="text-muted-foreground">{tx(quantity.label)}</p>
            <p
              className={cn(
                "font-medium",
                quantity.isLeft && "font-semibold text-brand",
                quantity.isLeft && quantity.value === 0 && "text-muted-foreground",
              )}
            >
              {quantity.value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
