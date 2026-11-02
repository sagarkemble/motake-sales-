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
import { CheckoutViewDesktop } from "~/components/salesman/checkout/checkout-view.desktop";
import { CheckoutViewMobile } from "~/components/salesman/checkout/checkout-view.mobile";
import { OrderTypeStep } from "~/components/salesman/checkout/order-type-step";
import { StepIndicatorDesktop } from "~/components/salesman/checkout/step-indicator.desktop";
import { StepIndicatorMobile } from "~/components/salesman/checkout/step-indicator.mobile";
import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOfficeOrder } from "~/hooks/use-office-order";
import { useTranslate } from "~/hooks/use-translate";

const STEP_LABELS = [
  "admin.orders.new.steps.customer",
  "admin.orders.new.steps.type",
  "admin.orders.new.steps.items",
  "admin.orders.new.steps.checkout",
];

// Variant A: the salesman's checkout wizard, Customer first since the Route prices come from the
// Customer. Checkout shows the lines and totals to verify, with the Payment or advance.
function NewOrderContent() {
  const tx = useTranslate();
  const router = useRouter();
  const { formatPaise } = useFormatMoney();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get("customer");
  const [step, setStepState] = useState(initialCustomerId ? 1 : 0);
  // The furthest step reached; any step up to it opens from the step indicator.
  const [furthestStep, setFurthestStep] = useState(initialCustomerId ? 1 : 0);

  function setStep(nextStep: number) {
    setStepState(nextStep);
    setFurthestStep((current) => Math.max(current, nextStep));
  }
  const order = useOfficeOrder(initialCustomerId, { isAtCheckout: step === 3 });

  if (order.result) {
    const { result } = order;
    const billId = result.kind === "billed" ? result.result.billId : null;
    const preOrderId = result.kind === "preorder" ? result.result.orderId : null;
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-4">
        <div className="w-full rounded-2xl border bg-card shadow-sm p-4">
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
                  setStepState(0);
                  setFurthestStep(0);
                },
              },
              {
                label: tx("admin.orders.new.backToOrders"),
                onClick: () => router.push("/admin/orders"),
              },
            ]}
          />
        </div>
      </div>
    );
  }

  const isLastStep = step === STEP_LABELS.length - 1;
  const quoteReady = Boolean(order.quote) && !order.isQuoteFetching;
  const stepProblemKey =
    step === 0
      ? !order.customerId || !order.summary
        ? "admin.orders.new.problem.pickCustomer"
        : order.inactive
          ? "admin.orders.new.problem.inactive"
          : null
      : step === 2
        ? order.lines.length === 0
          ? "admin.orders.new.problem.addItem"
          : null
        : isLastStep
          ? order.lines.length === 0
            ? "admin.orders.new.problem.addItem"
            : (order.quote?.badLines.length ?? 0) > 0
              ? "admin.orders.new.problem.removeBad"
              : !quoteReady
                ? "admin.orders.new.problem.checking"
                : order.checkoutProblemKey
          : null;
  const nextButtonLabel = !isLastStep
    ? tx("admin.orders.new.next")
    : order.orderType === "pre_order"
      ? tx("admin.orders.new.placePreOrder")
      : order.quote
        ? tx("admin.orders.new.placeBookNowAmount", {
            amount: formatPaise(order.quote.totals.totalPaise),
          })
        : tx("admin.orders.new.placeBookNow");

  const content = (
    <div className="flex flex-col gap-4">
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
          datePicker="popover"
        />
      )}
      {step === 2 && <ItemsStep order={order} />}
      {step === 3 && <CheckoutStep order={order} />}
    </div>
  );
  const viewProps = {
    showBackButton: step > 0,
    isNextDisabled: Boolean(stepProblemKey),
    isNextLoading: order.isPlacing,
    nextButtonLabel,
    hint: stepProblemKey ? tx(stepProblemKey) : null,
    onBack: () => setStep(step - 1),
    onNext: () => (isLastStep ? void order.place() : setStep(step + 1)),
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="px-4 pt-4 md:px-6">
        <BackHeader href="/admin/orders" title={tx("admin.orders.new.title")} />
      </div>
      <div className="md:hidden">
        <StepIndicatorMobile
          currentStepNumber={step + 1}
          stepLabels={STEP_LABELS}
          furthestStepNumber={furthestStep + 1}
          onStepClick={(stepNumber) => setStep(stepNumber - 1)}
        />
        <CheckoutViewMobile {...viewProps}>
          <div className="rounded-2xl border bg-card shadow-sm p-4">{content}</div>
        </CheckoutViewMobile>
      </div>
      <div className="hidden md:block">
        <StepIndicatorDesktop
          currentStepNumber={step + 1}
          stepLabels={STEP_LABELS}
          furthestStepNumber={furthestStep + 1}
          onStepClick={(stepNumber) => setStep(stepNumber - 1)}
        />
        <CheckoutViewDesktop {...viewProps}>{content}</CheckoutViewDesktop>
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
