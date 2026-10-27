"use client";

import type { CheckoutStep } from "~/hooks/salesman/use-checkout-wizard";

import { StepIndicatorDesktop } from "./step-indicator.desktop";
import { StepIndicatorMobile } from "./step-indicator.mobile";

export const CHECKOUT_STEP_LABELS: Record<CheckoutStep, string> = {
  cart: "salesman.checkout.steps.cart",
  type: "salesman.checkout.steps.type",
  customer: "salesman.checkout.steps.customer",
  payment: "salesman.checkout.steps.payment",
};

interface StepIndicatorProps {
  steps: CheckoutStep[];
  currentStepNumber: number;
}

export function StepIndicator({ steps, currentStepNumber }: StepIndicatorProps) {
  return (
    <>
      <div className="md:hidden">
        <StepIndicatorMobile currentStepNumber={currentStepNumber} totalStepCount={steps.length} />
      </div>
      <div className="hidden md:block">
        <StepIndicatorDesktop
          currentStepNumber={currentStepNumber}
          stepLabels={steps.map((step) => CHECKOUT_STEP_LABELS[step])}
        />
      </div>
    </>
  );
}
