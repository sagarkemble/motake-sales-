"use client";

import { TicketXIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface NoActiveGatepassNoticeProps {
  // The Route of today's GatePass when it was handed over or closed; null when none was allotted.
  handedOverRouteName: string | null;
  context: "customers" | "addCustomer";
  compact?: boolean;
}

/** Without an Active GatePass a salesman sees no Customers and cannot add one. */
export function NoActiveGatepassNotice({
  handedOverRouteName,
  context,
  compact = false,
}: NoActiveGatepassNoticeProps) {
  const tx = useTranslate();

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100",
        compact ? "p-3" : "items-center p-6 text-center",
      )}
    >
      <TicketXIcon className={cn("text-amber-600", compact ? "size-5" : "size-9")} />
      <p className="text-base font-semibold">{tx("salesman.checkout.noActiveGatepass.title")}</p>
      <p className="text-sm font-medium">
        {context === "customers"
          ? tx("salesman.checkout.noActiveGatepass.customers")
          : tx("salesman.checkout.noActiveGatepass.addCustomer")}
      </p>
      {!compact && (
        <p className="text-sm">
          {handedOverRouteName
            ? tx("salesman.checkout.noActiveGatepass.handedOver", { route: handedOverRouteName })
            : tx("salesman.checkout.noActiveGatepass.none")}
        </p>
      )}
    </div>
  );
}
