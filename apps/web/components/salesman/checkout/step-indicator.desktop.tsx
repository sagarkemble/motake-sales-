import { CheckIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface StepIndicatorDesktopProps {
  currentStepNumber: number;
  stepLabels: string[];
}

export function StepIndicatorDesktop({ currentStepNumber, stepLabels }: StepIndicatorDesktopProps) {
  return (
    <div className="flex items-center px-6 pt-6">
      {stepLabels.map((stepLabel, stepIndex) => {
        const stepNumber = stepIndex + 1;
        const isCompletedStep = stepNumber < currentStepNumber;
        const isCurrentStep = stepNumber === currentStepNumber;
        const isLastStep = stepIndex === stepLabels.length - 1;

        return (
          <div key={stepLabel} className={cn("flex items-center", !isLastStep && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                  isCompletedStep && "bg-brand text-brand-foreground",
                  isCurrentStep && "bg-brand text-brand-foreground",
                  !isCompletedStep && !isCurrentStep && "bg-muted text-muted-foreground",
                )}
              >
                {isCompletedStep ? <CheckIcon className="size-4" /> : stepNumber}
              </div>
              <p
                className={cn(
                  "text-xs font-medium",
                  isCurrentStep ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {stepLabel}
              </p>
            </div>
            {!isLastStep && (
              <div
                className={cn("mx-2 h-0.5 flex-1", isCompletedStep ? "bg-brand" : "bg-muted")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
