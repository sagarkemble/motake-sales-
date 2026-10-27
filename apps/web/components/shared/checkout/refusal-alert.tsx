"use client";

import { AlertTriangleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import {
  refusalHasAction,
  refusalMessageValues,
  type CheckoutRefusal,
} from "~/lib/checkout-refusal";
import { cn } from "~/lib/utils";

interface RefusalAlertProps {
  refusal: CheckoutRefusal;
  shopName: string;
  // Shown only for reasons whose copy names a next step.
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** A refused checkout in plain words; nothing was saved. */
export function RefusalAlert({
  refusal,
  shopName,
  onAction,
  onDismiss,
  className,
}: RefusalAlertProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const key = `checkout.refusal.${refusal.reason}`;
  const values = refusalMessageValues(refusal, { shopName, formatDate, formatPaise });
  const showAction = Boolean(onAction) && refusalHasAction(refusal.reason);

  return (
    <Alert
      variant="destructive"
      className={cn("border-destructive/30 bg-destructive/5", className)}
    >
      <AlertTriangleIcon />
      <AlertTitle className="line-clamp-none">{tx(`${key}.title`)}</AlertTitle>
      <AlertDescription>
        <p>{tx(`${key}.message`, values)}</p>
        {(showAction || onDismiss) && (
          <div className="mt-1 flex flex-wrap gap-2">
            {showAction && (
              <Button size="sm" variant="outline" className="rounded-full" onClick={onAction}>
                {tx(`${key}.action`)}
              </Button>
            )}
            {onDismiss && (
              <Button size="sm" variant="ghost" className="rounded-full" onClick={onDismiss}>
                {tx("checkout.refusal.dismiss")}
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
