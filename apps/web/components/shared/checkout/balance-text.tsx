"use client";

import { Badge } from "~/components/ui/badge";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { balanceStateOf, type BalanceState } from "~/lib/checkout-payment";
import { cn } from "~/lib/utils";

const BALANCE_CHIP_STYLE: Record<BalanceState, string> = {
  pending: "border-transparent bg-amber-500/10 text-amber-700",
  advance: "border-transparent bg-sky-500/10 text-sky-700",
  settled: "border-transparent bg-muted text-muted-foreground",
};

const BALANCE_TEXT_STYLE: Record<BalanceState, string> = {
  pending: "text-amber-700",
  advance: "text-sky-700",
  settled: "text-muted-foreground",
};

function useBalanceLabel(balancePaise: number) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balance = balanceStateOf(balancePaise);
  const label =
    balance.state === "settled"
      ? tx("checkout.balance.settled")
      : tx(`checkout.balance.${balance.state}Amount`, {
          amount: formatPaise(balance.amountPaise),
        });
  return { state: balance.state, label };
}

/** A Customer Balance as a chip: Pending ₹1,840.00, Advance ₹500.00 or Settled. */
export function BalanceChip({
  balancePaise,
  className,
}: {
  balancePaise: number;
  className?: string;
}) {
  const { state, label } = useBalanceLabel(balancePaise);
  return (
    <Badge variant="outline" className={cn(BALANCE_CHIP_STYLE[state], "tabular-nums", className)}>
      {label}
    </Badge>
  );
}

/** A Customer Balance as coloured text. */
export function BalanceText({
  balancePaise,
  className,
}: {
  balancePaise: number;
  className?: string;
}) {
  const { state, label } = useBalanceLabel(balancePaise);
  return <span className={cn("tabular-nums", BALANCE_TEXT_STYLE[state], className)}>{label}</span>;
}
