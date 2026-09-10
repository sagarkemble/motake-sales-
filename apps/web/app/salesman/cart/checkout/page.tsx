"use client";

import { CartEmptyState } from "~/components/salesman/cart/cart-empty-state";
import { CheckoutViewDesktop } from "~/components/salesman/checkout/checkout-view.desktop";
import { CheckoutViewMobile } from "~/components/salesman/checkout/checkout-view.mobile";
import { CustomerDetailsStep } from "~/components/salesman/checkout/customer-details-step";
import { OrderSuccessStep } from "~/components/salesman/checkout/order-success-step";
import { OrderTypeStep } from "~/components/salesman/checkout/order-type-step";
import { StepIndicator } from "~/components/salesman/checkout/step-indicator";
import { VerifyProductsStep } from "~/components/salesman/checkout/verify-products-step";
import { useCheckoutWizard } from "~/hooks/salesman/use-checkout-wizard";
import { useTranslate } from "~/hooks/use-translate";

export default function SalesmanCheckoutPage() {
  const tx = useTranslate();
  const wizard = useCheckoutWizard();

  if (wizard.placedOrder) {
    return (
      <OrderSuccessStep
        placedOrder={wizard.placedOrder}
        onViewOrders={wizard.goToOrdersList}
        onBackToHome={wizard.goToHome}
      />
    );
  }

  if (wizard.cartLines.length === 0) {
    return <CartEmptyState />;
  }

  const stepContent =
    wizard.currentStepNumber === 1 ? (
      <VerifyProductsStep
        cartLines={wizard.cartLines}
        totalCartQuantity={wizard.totalCartQuantity}
        totalCartAmount={wizard.totalCartAmount}
        onQuantityChange={wizard.onCartQuantityChange}
        onRemove={wizard.onCartLineRemove}
      />
    ) : wizard.currentStepNumber === 2 ? (
      <OrderTypeStep
        orderType={wizard.orderType}
        onOrderTypeChange={wizard.setOrderType}
        isBookNowAllowed={wizard.isBookNowAllowed}
        bookNowBlockReasons={wizard.bookNowBlockReasons}
        nextDayDate={wizard.nextDayDate}
        totalCartAmount={wizard.totalCartAmount}
      />
    ) : (
      <CustomerDetailsStep
        customerSearchTerm={wizard.customerSearchTerm}
        onCustomerSearchTermChange={wizard.setCustomerSearchTerm}
        customerOptions={wizard.customersPage.items}
        isCustomerListLoading={wizard.isCustomersListLoading}
        selectedCustomer={wizard.selectedCustomer}
        onSelectCustomer={wizard.selectExistingCustomer}
        onClearSelectedCustomer={wizard.clearSelectedCustomer}
        newCustomerForm={wizard.newCustomerForm}
        onNewCustomerFormChange={wizard.updateNewCustomerForm}
        totalCartAmount={wizard.totalCartAmount}
      />
    );

  const isLastStep = wizard.currentStepNumber === 3;
  const nextButtonLabel = isLastStep
    ? tx("salesman.checkout.cta.placeOrder")
    : wizard.currentStepNumber === 1
      ? tx("salesman.checkout.cta.nextOrderType")
      : tx("salesman.checkout.cta.nextCustomer");
  const isOrderTypeStepInvalid =
    wizard.currentStepNumber === 2 && wizard.orderType === "book_now" && !wizard.isBookNowAllowed;
  const isNextDisabled = isOrderTypeStepInvalid || (isLastStep && !wizard.isCustomerStepValid);
  const isNextLoading = isLastStep ? wizard.isPlacingOrder || wizard.isCreatingCustomer : false;

  function handleNext() {
    if (isLastStep) {
      void wizard.placeOrder();
    } else {
      void wizard.goToNextStep();
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <StepIndicator currentStepNumber={wizard.currentStepNumber} />

      <div className="md:hidden">
        <CheckoutViewMobile
          showBackButton={wizard.currentStepNumber > 1}
          isNextDisabled={isNextDisabled}
          isNextLoading={isNextLoading}
          nextButtonLabel={nextButtonLabel}
          onBack={wizard.goToPreviousStep}
          onNext={handleNext}
        >
          {stepContent}
        </CheckoutViewMobile>
      </div>
      <div className="hidden md:block">
        <CheckoutViewDesktop
          showBackButton={wizard.currentStepNumber > 1}
          isNextDisabled={isNextDisabled}
          isNextLoading={isNextLoading}
          nextButtonLabel={nextButtonLabel}
          onBack={wizard.goToPreviousStep}
          onNext={handleNext}
        >
          {stepContent}
        </CheckoutViewDesktop>
      </div>
    </div>
  );
}
