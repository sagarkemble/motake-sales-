import { StepIndicatorDesktop } from "./step-indicator.desktop";
import { StepIndicatorMobile } from "./step-indicator.mobile";

export const CHECKOUT_STEP_LABELS = ["Verify products", "Order type", "Customer details"];

interface StepIndicatorProps {
  currentStepNumber: number;
}

export function StepIndicator({ currentStepNumber }: StepIndicatorProps) {
  return (
    <>
      <div className="md:hidden">
        <StepIndicatorMobile
          currentStepNumber={currentStepNumber}
          totalStepCount={CHECKOUT_STEP_LABELS.length}
        />
      </div>
      <div className="hidden md:block">
        <StepIndicatorDesktop
          currentStepNumber={currentStepNumber}
          stepLabels={CHECKOUT_STEP_LABELS}
        />
      </div>
    </>
  );
}
