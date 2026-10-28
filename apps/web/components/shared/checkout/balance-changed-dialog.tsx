"use client";

import { BalanceText } from "~/components/shared/checkout/balance-text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { paymentMaths, type PaymentContext, type PaymentDraft } from "~/lib/checkout-payment";
import { cn } from "~/lib/utils";

interface BalanceChangedDialogProps {
  // The Balance the Payment step showed, and the one the server found under the lock.
  wasContext: PaymentContext | null;
  nowBalancePaise: number | null;
  draft: PaymentDraft;
  shopName: string;
  isPlacing: boolean;
  onChangePayment: () => void;
  onPlaceAgain: () => void;
}

/** balance_changed: nothing was saved; Was / Now, then place again with a new key. */
export function BalanceChangedDialog({
  wasContext,
  nowBalancePaise,
  draft,
  shopName,
  isPlacing,
  onChangePayment,
  onPlaceAgain,
}: BalanceChangedDialogProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const isOpen = wasContext !== null && nowBalancePaise !== null;
  const was = wasContext ? paymentMaths(wasContext, draft) : null;
  const now = wasContext
    ? paymentMaths({ ...wasContext, balanceBeforePaise: nowBalancePaise ?? 0 }, draft)
    : null;
  const needsChoice = now?.preview.needsOverpayChoice ?? false;

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tx("checkout.balanceChanged.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {tx("checkout.balanceChanged.body", { shop: shopName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {was && now && wasContext && (
          // Rows, not a table: at 360px each row wraps its Was / Now under the label instead of
          // scrolling sideways.
          <div className="flex flex-col divide-y rounded-xl border text-sm">
            <div className="flex justify-end gap-3 px-3 py-1.5 text-xs text-muted-foreground">
              <span>{tx("checkout.balanceChanged.was")}</span>
              <span aria-hidden>→</span>
              <span>{tx("checkout.balanceChanged.now")}</span>
            </div>
            <CompareRow
              label={tx("checkout.balanceChanged.balance")}
              wasLabel={tx("checkout.balanceChanged.was")}
              nowLabel={tx("checkout.balanceChanged.now")}
              was={<BalanceText balancePaise={wasContext.balanceBeforePaise} />}
              now={<BalanceText balancePaise={nowBalancePaise ?? 0} />}
            />
            <CompareRow
              label={tx("checkout.balanceChanged.toClear")}
              wasLabel={tx("checkout.balanceChanged.was")}
              nowLabel={tx("checkout.balanceChanged.now")}
              was={formatPaise(was.requiredPaise)}
              now={formatPaise(now.requiredPaise)}
            />
            <CompareRow
              label={tx("checkout.balanceChanged.keep")}
              wasLabel={tx("checkout.balanceChanged.was")}
              nowLabel={tx("checkout.balanceChanged.now")}
              was={formatPaise(was.preview.keptPaise)}
              now={formatPaise(now.preview.keptPaise)}
            />
            <CompareRow
              label={tx("checkout.balanceChanged.giveBack")}
              wasLabel={tx("checkout.balanceChanged.was")}
              nowLabel={tx("checkout.balanceChanged.now")}
              was={formatPaise(was.preview.returnedPaise)}
              now={formatPaise(now.preview.returnedPaise)}
              highlight
            />
          </div>
        )}
        {needsChoice && (
          <p className="text-sm text-amber-700">{tx("checkout.balanceChanged.chooseFirst")}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isPlacing}
            onClick={onChangePayment}
            className="rounded-full"
          >
            {tx("checkout.balanceChanged.changePayment")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPlacing || needsChoice}
            onClick={(event) => {
              event.preventDefault();
              onPlaceAgain();
            }}
            className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {isPlacing
              ? tx("checkout.balanceChanged.placing")
              : tx("checkout.balanceChanged.placeAgain")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CompareRow({
  label,
  wasLabel,
  nowLabel,
  was,
  now,
  highlight,
}: {
  label: string;
  wasLabel: string;
  nowLabel: string;
  was: React.ReactNode;
  now: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2",
        highlight && "bg-amber-500/10 font-medium",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto flex flex-wrap items-baseline justify-end gap-x-2 tabular-nums">
        <span className="text-muted-foreground line-through">
          <span className="sr-only">{wasLabel} </span>
          {was}
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <span>
          <span className="sr-only">{nowLabel} </span>
          {now}
        </span>
      </span>
    </div>
  );
}
