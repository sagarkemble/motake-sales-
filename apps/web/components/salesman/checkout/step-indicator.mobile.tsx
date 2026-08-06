import { CheckIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface StepIndicatorMobileProps {
  currentStepNumber: number;
  totalStepCount: number;
}

export function StepIndicatorMobile({ currentStepNumber, totalStepCount }: StepIndicatorMobileProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 pt-4">
      {Array.from({ length: totalStepCount }, (_, stepIndex) => {
        const stepNumber = stepIndex + 1;
        const isCompletedStep = stepNumber < currentStepNumber;
        const isCurrentStep = stepNumber === currentStepNumber;
        const isLastStep = stepNumber === totalStepCount;

        return (
          <div key={stepNumber} className="flex items-center">
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                (isCompletedStep || isCurrentStep) && "bg-brand text-brand-foreground",
                !isCompletedStep && !isCurrentStep && "bg-muted text-muted-foreground",
              )}
            >
              {isCompletedStep ? <CheckIcon className="size-3.5" /> : stepNumber}
            </div>
            {!isLastStep && (
              <div className={cn("h-0.5 w-8", isCompletedStep ? "bg-brand" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
