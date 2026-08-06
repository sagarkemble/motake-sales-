"use client";

import { CartEmptyState } from "~/components/salesman/cart/cart-empty-state";
import { CheckoutViewDesktop } from "~/components/salesman/checkout/checkout-view.desktop";
import { CheckoutViewMobile } from "~/components/salesman/checkout/checkout-view.mobile";
import { CustomerDetailsStep } from "~/components/salesman/checkout/customer-details-step";
import { OrderTypeStep } from "~/components/salesman/checkout/order-type-step";
import { StepIndicator } from "~/components/salesman/checkout/step-indicator";
import { VerifyProductsStep } from "~/components/salesman/checkout/verify-products-step";
import { useCheckoutWizard } from "~/hooks/salesman/use-checkout-wizard";

export default function SalesmanCheckoutPage() {
  const wizard = useCheckoutWizard();

  if (wizard.cartLines.length === 0) {
    return <CartEmptyState />;
  }

  const stepContent =
    wizard.currentStepNumber === 1 ? (
      <VerifyProductsStep
        cartLines={wizard.cartLines}
        totalCartQuantity={wizard.totalCartQuantity}
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
      />
    );

  const isLastStep = wizard.currentStepNumber === 3;
  const nextButtonLabel = isLastStep
    ? "Place order"
    : wizard.currentStepNumber === 1
      ? "Next: Order type"
      : "Next: Customer details";
  const isNextDisabled = isLastStep && !wizard.isCustomerStepValid;
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
