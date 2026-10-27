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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { paymentMaths, type PaymentContext, type PaymentDraft } from "~/lib/checkout-payment";

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">{tx("checkout.balanceChanged.was")}</TableHead>
                <TableHead className="text-right">{tx("checkout.balanceChanged.now")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <CompareRow
                label={tx("checkout.balanceChanged.balance")}
                was={<BalanceText balancePaise={wasContext.balanceBeforePaise} />}
                now={<BalanceText balancePaise={nowBalancePaise ?? 0} />}
              />
              <CompareRow
                label={tx("checkout.balanceChanged.toClear")}
                was={formatPaise(was.requiredPaise)}
                now={formatPaise(now.requiredPaise)}
              />
              <CompareRow
                label={tx("checkout.balanceChanged.keep")}
                was={formatPaise(was.preview.keptPaise)}
                now={formatPaise(now.preview.keptPaise)}
              />
              <CompareRow
                label={tx("checkout.balanceChanged.giveBack")}
                was={formatPaise(was.preview.returnedPaise)}
                now={formatPaise(now.preview.returnedPaise)}
                highlight
              />
            </TableBody>
          </Table>
        )}
        {needsChoice && (
          <p className="text-sm text-amber-700">{tx("checkout.balanceChanged.chooseFirst")}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPlacing} onClick={onChangePayment}>
            {tx("checkout.balanceChanged.changePayment")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPlacing || needsChoice}
            onClick={(event) => {
              event.preventDefault();
              onPlaceAgain();
            }}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
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
  was,
  now,
  highlight,
}: {
  label: string;
  was: React.ReactNode;
  now: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <TableRow className={highlight ? "bg-amber-500/10 font-medium" : undefined}>
      <TableCell className="whitespace-normal text-muted-foreground">{label}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground line-through">
        {was}
      </TableCell>
      <TableCell className="text-right tabular-nums">{now}</TableCell>
    </TableRow>
  );
}
