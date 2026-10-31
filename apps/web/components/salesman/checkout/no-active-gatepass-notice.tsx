"use client";

import { TicketXIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { useTranslate } from "~/hooks/use-translate";

interface NoActiveGatepassNoticeProps {
  // The Route of today's GatePass when it was handed over or closed; null when none was allotted.
  handedOverRouteName: string | null;
  context: "customers" | "addCustomer" | "catalog";
  compact?: boolean;
}

/** Without an Active GatePass a salesman sees no Customers, cannot add one and cannot add to cart. */
export function NoActiveGatepassNotice({
  handedOverRouteName,
  context,
  compact = false,
}: NoActiveGatepassNoticeProps) {
  const tx = useTranslate();

  return (
    <Alert role="status" className="border-amber-500/40 bg-amber-500/5">
      <TicketXIcon className="text-amber-700" />
      <AlertTitle className="line-clamp-none">
        {tx("salesman.checkout.noActiveGatepass.title")}
      </AlertTitle>
      <AlertDescription>
        <p className="font-medium text-foreground">
          {tx(`salesman.checkout.noActiveGatepass.${context}`)}
        </p>
        {!compact && (
          <p>
            {handedOverRouteName
              ? tx("salesman.checkout.noActiveGatepass.handedOver", { route: handedOverRouteName })
              : tx("salesman.checkout.noActiveGatepass.none")}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
