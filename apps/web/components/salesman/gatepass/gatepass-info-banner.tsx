"use client";

import { InfoIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";

export function GatepassInfoBanner() {
  const tx = useTranslate();

  return (
    <div className="flex items-start gap-2 rounded-2xl bg-brand/5 p-3">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-brand" />
      <p className="text-xs text-muted-foreground">
        {tx("salesman.gatepass.hint.ordersDeductOnly")}
      </p>
    </div>
  );
}
