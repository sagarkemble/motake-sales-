"use client";

import { AlertTriangleIcon } from "lucide-react";

import { CartEmptyState } from "~/components/salesman/cart/cart-empty-state";
import { CheckoutViewDesktop } from "~/components/salesman/checkout/checkout-view.desktop";
import { CheckoutViewMobile } from "~/components/salesman/checkout/checkout-view.mobile";
import { CustomerDetailsStep } from "~/components/salesman/checkout/customer-details-step";
import { OrderTypeStep } from "~/components/salesman/checkout/order-type-step";
import { PaymentStep } from "~/components/salesman/checkout/payment-step";
import { StepIndicator } from "~/components/salesman/checkout/step-indicator";
import { VerifyProductsStep } from "~/components/salesman/checkout/verify-products-step";
import { BalanceChangedDialog } from "~/components/shared/checkout/balance-changed-dialog";
import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { useCheckoutWizard } from "~/hooks/salesman/use-checkout-wizard";
import { useTranslate } from "~/hooks/use-translate";

export default function SalesmanCheckoutPage() {
  const tx = useTranslate();
  const wizard = useCheckoutWizard();

  if (wizard.result) {
    return (
      <CheckoutSuccess
        input={wizard.result}
        whatsapp
        actions={[
          {
            label: tx("salesman.checkout.success.viewOrder"),
            onClick: wizard.goToPlacedOrder,
            primary: true,
          },
          { label: tx("salesman.checkout.success.backHome"), onClick: wizard.goToHome },
        ]}
      />
    );
  }

  if (wizard.cartLines.length === 0) {
    return <CartEmptyState />;
  }

  const shopName = wizard.selectedCustomer?.shopName ?? wizard.newCustomerForm.shopName.trim();

  const stepContent =
    wizard.currentStep === "cart" ? (
      <VerifyProductsStep
        cartLines={wizard.cartLines}
        routeName={wizard.activeGatepassRoute?.name ?? null}
        quote={wizard.quote}
        isQuoteLoading={wizard.isQuoteLoading}
        quoteRefusal={wizard.quoteRefusal}
        hasQuoteError={Boolean(wizard.quoteError)}
        onRetryQuote={() => void wizard.refetchQuote()}
        onQuantityChange={wizard.onCartQuantityChange}
        onRemove={wizard.onCartLineRemove}
      />
    ) : wizard.currentStep === "type" ? (
      <OrderTypeStep
        orderType={wizard.orderType}
        onOrderTypeChange={wizard.setOrderType}
        isBookNowAllowed={wizard.isBookNowAllowed}
        bookNowBlockReasons={wizard.bookNowBlockReasons}
        scheduledDate={wizard.scheduledDate}
        onScheduledDateChange={wizard.setScheduledDate}
        earliestDate={wizard.todayDateKey}
      />
    ) : wizard.currentStep === "customer" ? (
      <CustomerDetailsStep
        activeGatepassRoute={wizard.activeGatepassRoute}
        isActiveGatepassLoading={wizard.isMyGatepassLoading}
        handedOverRouteName={
          wizard.myGatepass && !wizard.activeGatepassRoute
            ? wizard.myGatepass.gatepass.routeName
            : null
        }
        customerSearchTerm={wizard.customerSearchTerm}
        onCustomerSearchTermChange={wizard.setCustomerSearchTerm}
        customerOptions={wizard.customersPage.items}
        customerTotalCount={wizard.customersPage.totalCount}
        isCustomerListLoading={wizard.isCustomersListLoading}
        selectedCustomer={wizard.selectedCustomer}
        onSelectCustomer={wizard.selectExistingCustomer}
        onClearSelectedCustomer={wizard.clearSelectedCustomer}
        newCustomerForm={wizard.newCustomerForm}
        onNewCustomerFormChange={wizard.updateNewCustomerForm}
        totalCartQuantity={wizard.totalCartQuantity}
      />
    ) : (
      <PaymentStep
        shopName={shopName}
        paymentContext={wizard.paymentContext}
        paymentDraft={wizard.paymentDraft}
        onPaymentDraftChange={wizard.setPaymentDraft}
        isPlacing={wizard.isPlacingOrder}
        quoteRefusal={wizard.quoteRefusal}
        hasQuoteError={Boolean(wizard.quoteError)}
        onRetryQuote={() => void wizard.refetchQuote()}
        onQuoteRefusalAction={wizard.handleRefusalAction}
      />
    );

  const content = (
    <>
      {wizard.isOutcomeUnknown && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangleIcon className="text-amber-700" />
          <AlertTitle>{tx("salesman.checkout.outcomeUnknown.title")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {tx("salesman.checkout.outcomeUnknown.message")}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={wizard.goToOrdersList}
            >
              {tx("salesman.checkout.outcomeUnknown.action")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {wizard.refusal && (
        <RefusalAlert
          refusal={wizard.refusal}
          shopName={shopName}
          onAction={() => wizard.handleRefusalAction()}
          onDismiss={wizard.clearRefusal}
        />
      )}
      {stepContent}
    </>
  );

  const nextButtonLabel =
    wizard.currentStep === "cart"
      ? tx("salesman.checkout.cta.nextOrderType")
      : wizard.currentStep === "type"
        ? tx("salesman.checkout.cta.nextCustomer")
        : wizard.currentStep === "customer"
          ? wizard.orderType === "pre_order"
            ? tx("salesman.checkout.cta.placePreOrder")
            : tx("salesman.checkout.cta.nextPayment")
          : tx("salesman.checkout.cta.placeBookNow");
  const isNextLoading =
    wizard.currentStep === "customer" || wizard.currentStep === "payment"
      ? wizard.isPlacingOrder || wizard.isCreatingCustomer
      : false;
  const hint = wizard.stepProblemKey ? tx(wizard.stepProblemKey) : null;

  const viewProps = {
    showBackButton: wizard.currentStepIndex > 0,
    isNextDisabled: wizard.isNextDisabled,
    isNextLoading,
    nextButtonLabel,
    hint,
    onBack: wizard.goToPreviousStep,
    onNext: () => void wizard.goToNextStep(),
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <StepIndicator steps={wizard.steps} currentStepNumber={wizard.currentStepIndex + 1} />

      <div className="md:hidden">
        <CheckoutViewMobile {...viewProps}>{content}</CheckoutViewMobile>
      </div>
      <div className="hidden md:block">
        <CheckoutViewDesktop {...viewProps}>
          <div className="flex flex-col gap-4">{content}</div>
        </CheckoutViewDesktop>
      </div>

      <BalanceChangedDialog
        wasContext={wizard.balanceChange?.wasContext ?? null}
        nowBalancePaise={wizard.balanceChange?.nowBalancePaise ?? null}
        draft={wizard.paymentDraft}
        shopName={shopName}
        isPlacing={wizard.isPlacingOrder}
        onChangePayment={wizard.changePaymentAfterBalanceChange}
        onPlaceAgain={() => void wizard.placeAgainWithNewAmounts()}
      />
    </div>
  );
}
