"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { AlertTriangleIcon, CalendarCheckIcon, CheckIcon, WalletIcon } from "lucide-react";

import { BalanceText } from "~/components/shared/checkout/balance-text";
import { CheckoutWhatsapp } from "~/components/shared/whatsapp/checkout-whatsapp";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import type { PaymentMode } from "~/lib/checkout-payment";
import { cn } from "~/lib/utils";

export type BilledCheckoutResult = RouterOutputs["orders"]["placeBookNow"]["data"];
export type PreOrderResult = RouterOutputs["orders"]["placePreOrder"]["data"];
export type FieldPaymentResult = RouterOutputs["payments"]["recordField"]["data"];

export type CheckoutSuccessInput =
  | {
      kind: "billed";
      headingKey: "checkout.success.billed" | "checkout.success.fulfilled";
      shopName: string;
      mode: PaymentMode;
      result: BilledCheckoutResult;
      // Cash to give back as the Payment step showed it, to flag a server difference.
      previewReturnedPaise: number;
    }
  | { kind: "preorder"; shopName: string; totalQuantity: number; result: PreOrderResult }
  | {
      kind: "field";
      shopName: string;
      mode: PaymentMode;
      result: FieldPaymentResult;
      previewReturnedPaise: number;
    };

interface FactRow {
  key: string;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  highlight?: boolean;
}

/**
 * Tick + fact rows after a Book Now, fulfil, Pre-order or field Payment. With `whatsapp` (the
 * salesman's result), a pill under the tick shows the Bill and Receipt WhatsApp status.
 */
export function CheckoutSuccess({
  input,
  actions,
  whatsapp = false,
}: {
  input: CheckoutSuccessInput;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
  whatsapp?: boolean;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  const rows: FactRow[] = [];
  let title: string;
  let balancePaise: number;
  let note: string | null = null;
  let returnedChange: { now: number; was: number } | null = null;

  if (input.kind === "billed") {
    const { result } = input;
    title = tx(input.headingKey);
    balancePaise = result.balancePaise;
    rows.push(
      { key: "bill", label: tx("checkout.success.bill"), value: result.billNumber, mono: true },
      {
        key: "billTotal",
        label: tx("checkout.success.billTotal"),
        value: formatPaise(result.billTotalPaise),
      },
    );
    if (result.payment) {
      rows.push(
        {
          key: "payment",
          label: tx("checkout.success.payment", {
            mode: tx(`checkout.payment.modes.${input.mode}`),
          }),
          value: result.payment.number,
          mono: true,
        },
        {
          key: "kept",
          label: tx("checkout.success.kept"),
          value: formatPaise(result.payment.keptPaise),
        },
      );
    } else {
      // No money taken: an Advance held before this Bill pays it first.
      const advanceBeforePaise = Math.max(0, result.billTotalPaise - result.balancePaise);
      const fromAdvancePaise = Math.min(advanceBeforePaise, result.billTotalPaise);
      rows.push({
        key: "payment",
        label: tx("checkout.success.paymentLabel"),
        value:
          fromAdvancePaise === 0
            ? tx("checkout.success.noPayment")
            : fromAdvancePaise === result.billTotalPaise
              ? tx("checkout.success.paidFromAdvance")
              : tx("checkout.success.partlyFromAdvance", {
                  advance: formatPaise(fromAdvancePaise),
                  pending: formatPaise(result.billTotalPaise - fromAdvancePaise),
                }),
      });
    }
    if (result.returnedPaise !== input.previewReturnedPaise)
      returnedChange = { now: result.returnedPaise, was: input.previewReturnedPaise };
    if (result.returnedPaise > 0 || returnedChange)
      rows.push({
        key: "returned",
        label: tx("checkout.success.cashReturned"),
        value: formatPaise(result.returnedPaise),
        highlight: Boolean(returnedChange),
      });
  } else if (input.kind === "preorder") {
    const { result } = input;
    title = tx("checkout.success.preorder");
    balancePaise = result.balancePaise;
    note = tx("checkout.success.preorderNote");
    rows.push(
      {
        key: "deliverOn",
        label: tx("checkout.success.deliverOn"),
        value: formatDate(result.scheduledDate, "EEE, d MMM yyyy"),
      },
      {
        key: "items",
        label: tx("checkout.success.items"),
        value: tx("checkout.success.itemsQty", { count: input.totalQuantity }),
      },
      {
        key: "indicative",
        label: tx("checkout.success.indicativeTotal"),
        value: tx("checkout.success.indicativeValue", {
          amount: formatPaise(result.indicativeTotalPaise),
        }),
      },
      { key: "bill", label: tx("checkout.success.bill"), value: tx("checkout.success.notBilled") },
    );
  } else {
    const { result } = input;
    title = tx("checkout.success.field");
    balancePaise = result.balancePaise;
    rows.push(
      {
        key: "payment",
        label: tx("checkout.success.payment", {
          mode: tx(`checkout.payment.modes.${input.mode}`),
        }),
        value: result.number,
        mono: true,
      },
      { key: "kept", label: tx("checkout.success.kept"), value: formatPaise(result.keptPaise) },
    );
    if (result.returnedPaise !== input.previewReturnedPaise)
      returnedChange = { now: result.returnedPaise, was: input.previewReturnedPaise };
    if (result.returnedPaise > 0 || returnedChange)
      rows.push({
        key: "returned",
        label: tx("checkout.success.cashReturned"),
        value: formatPaise(result.returnedPaise),
        highlight: Boolean(returnedChange),
      });
  }

  const Icon =
    input.kind === "preorder" ? CalendarCheckIcon : input.kind === "field" ? WalletIcon : CheckIcon;
  // A Pre-order sends nothing until it is fulfilled.
  const messages =
    input.kind === "billed"
      ? { billId: input.result.billId, paymentId: input.result.payment?.paymentId ?? null }
      : input.kind === "field"
        ? { billId: null, paymentId: input.result.paymentId }
        : null;

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Icon className="size-10" />
      </span>

      <div>
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{input.shopName}</p>
      </div>

      {whatsapp && messages && <CheckoutWhatsapp shopName={input.shopName} {...messages} />}

      {returnedChange && (
        <Alert className="max-w-sm border-amber-500/40 bg-amber-faint text-left">
          <AlertTriangleIcon className="text-amber-700" />
          <AlertTitle className="line-clamp-none">
            {tx("checkout.success.returnedChanged", {
              now: formatPaise(returnedChange.now),
              was: formatPaise(returnedChange.was),
            })}
          </AlertTitle>
          <AlertDescription>{tx("checkout.success.returnedChangedHint")}</AlertDescription>
        </Alert>
      )}

      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-4 text-left">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex items-start justify-between gap-3",
              row.highlight && "-mx-2 rounded-md bg-amber-500/10 px-2 py-1",
            )}
          >
            <p className="text-xs text-muted-foreground">{row.label}</p>
            <p
              className={cn(
                "break-all text-right text-sm font-medium",
                row.mono && "font-mono text-xs",
                row.highlight && "font-semibold text-amber-700",
              )}
            >
              {row.value}
            </p>
          </div>
        ))}
        <Separator />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {tx(
              input.kind === "preorder"
                ? "checkout.success.balanceUnchanged"
                : "checkout.success.newBalance",
            )}
          </p>
          <BalanceText balancePaise={balancePaise} className="text-sm font-semibold" />
        </div>
      </div>

      {note && <p className="max-w-sm text-xs text-muted-foreground">{note}</p>}

      <div className="flex w-full max-w-sm flex-col gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant={action.primary ? "default" : "outline"}
            onClick={action.onClick}
            className={cn(
              "w-full rounded-full",
              action.primary && "bg-brand text-brand-foreground hover:bg-brand/90",
            )}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
