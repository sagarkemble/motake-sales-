"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  CheckoutStep,
  CustomerStep,
  ItemsStep,
  PickedCustomer,
} from "~/components/admin/orders/new-order-steps";
import { BackHeader } from "~/components/admin/products/back-header";
import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { OrderTypeStep } from "~/components/salesman/checkout/order-type-step";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOfficeOrder } from "~/hooks/use-office-order";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

const STEPS = ["customer", "type", "items", "checkout"] as const;

// Variant A: the salesman's wizard, Customer first since the Route prices come from the Customer.
function NewOrderContent() {
  const tx = useTranslate();
  const router = useRouter();
  const { formatPaise } = useFormatMoney();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get("customer");
  const order = useOfficeOrder(initialCustomerId);
  const [step, setStep] = useState(initialCustomerId ? 1 : 0);

  if (order.result) {
    const { result } = order;
    const billId = result.kind === "billed" ? result.result.billId : null;
    const preOrderId = result.kind === "preorder" ? result.result.orderId : null;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-4">
        <CheckoutSuccess
          input={result}
          actions={[
            billId
              ? {
                  label: tx("admin.orders.new.openBill"),
                  onClick: () => router.push(`/admin/ledger/bills/${billId}`),
                  primary: true,
                }
              : {
                  label: tx("admin.orders.new.openPreOrder"),
                  onClick: () => router.push(`/admin/ledger/pre-orders/${preOrderId}`),
                  primary: true,
                },
            {
              label: tx("admin.orders.new.another"),
              onClick: () => {
                order.reset();
                setStep(0);
              },
            },
            {
              label: tx("admin.orders.new.backToOrders"),
              onClick: () => router.push("/admin/orders"),
            },
          ]}
        />
      </div>
    );
  }

  const quoteReady = Boolean(order.quote) && !order.isQuoteFetching;
  const stepProblemKey =
    step === 0
      ? !order.customerId || !order.summary
        ? "admin.orders.new.problem.pickCustomer"
        : order.inactive
          ? "admin.orders.new.problem.inactive"
          : null
      : step === 2 || step === 3
        ? order.lines.length === 0
          ? "admin.orders.new.problem.addItem"
          : (order.quote?.badLines.length ?? 0) > 0
            ? "admin.orders.new.problem.removeBad"
            : !quoteReady
              ? "admin.orders.new.problem.checking"
              : step === 3
                ? order.checkoutProblemKey
                : null
        : null;
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4">
      <BackHeader href="/admin/orders" title={tx("admin.orders.new.title")} />

      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-medium",
                index < step && "border-brand bg-brand text-brand-foreground",
                index === step && "border-brand text-brand",
                index > step && "text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cn(
                "text-[11px]",
                index === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {tx(`admin.orders.new.steps.${label}`)}
            </span>
          </li>
        ))}
      </ol>

      {step > 0 && <PickedCustomer order={order} onChange={() => setStep(0)} />}

      {step === 0 && <CustomerStep order={order} />}
      {step === 1 && (
        <OrderTypeStep
          orderType={order.orderType}
          onOrderTypeChange={order.setOrderType}
          isBookNowAllowed
          bookNowBlockReasons={[]}
          scheduledDate={order.scheduledDate}
          onScheduledDateChange={order.setScheduledDate}
          earliestDate={order.today}
        />
      )}
      {step === 2 && <ItemsStep order={order} />}
      {step === 3 && <CheckoutStep order={order} />}

      <div className="sticky bottom-16 z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="flex flex-col gap-1.5">
          {stepProblemKey && <p className="text-xs text-amber-700">{tx(stepProblemKey)}</p>}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={order.isPlacing}
                onClick={() => setStep(step - 1)}
              >
                {tx("admin.orders.new.back")}
              </Button>
            )}
            {step >= 2 && order.quote && order.lines.length > 0 && (
              <span className="min-w-0 flex-1 truncate text-sm tabular-nums">
                {tx("admin.orders.new.totalLine", {
                  count: order.quote.totals.totalQuantity,
                  amount: formatPaise(order.quote.totals.totalPaise),
                })}
              </span>
            )}
            <Button
              type="button"
              className="ml-auto rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={Boolean(stepProblemKey) || order.isPlacing}
              onClick={() => (isLastStep ? void order.place() : setStep(step + 1))}
            >
              {order.isPlacing && <Spinner />}
              {!isLastStep
                ? tx("admin.orders.new.next")
                : order.isPlacing
                  ? tx("admin.orders.new.placing")
                  : tx(
                      order.orderType === "pre_order"
                        ? "admin.orders.new.placePreOrder"
                        : "admin.orders.new.placeBookNow",
                    )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminNewOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-4">
          <ListItemSkeleton count={5} />
        </div>
      }
    >
      <NewOrderContent />
    </Suspense>
  );
}
