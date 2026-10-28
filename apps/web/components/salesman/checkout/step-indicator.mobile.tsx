"use client";

import { CheckIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface StepIndicatorMobileProps {
  currentStepNumber: number;
  stepLabels: string[];
}

export function StepIndicatorMobile({ currentStepNumber, stepLabels }: StepIndicatorMobileProps) {
  const tx = useTranslate();

  return (
    <div className="flex items-start px-4 pt-4">
      {stepLabels.map((stepLabel, stepIndex) => {
        const stepNumber = stepIndex + 1;
        const isCompletedStep = stepNumber < currentStepNumber;
        const isCurrentStep = stepNumber === currentStepNumber;
        const isLastStep = stepIndex === stepLabels.length - 1;

        return (
          <div key={stepLabel} className={cn("flex items-start", !isLastStep && "flex-1")}>
            <div className="flex w-14 flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  (isCompletedStep || isCurrentStep) && "bg-brand text-brand-foreground",
                  !isCompletedStep && !isCurrentStep && "bg-muted text-muted-foreground",
                )}
              >
                {isCompletedStep ? <CheckIcon className="size-3.5" /> : stepNumber}
              </div>
              <p
                className={cn(
                  "w-full truncate text-center text-[11px] font-medium leading-tight",
                  isCurrentStep ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {tx(stepLabel)}
              </p>
            </div>
            {!isLastStep && (
              <div
                className={cn(
                  "mt-3.5 h-0.5 min-w-2 flex-1",
                  isCompletedStep ? "bg-brand" : "bg-muted",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
