"use client";

import { CheckIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface StepIndicatorDesktopProps {
  currentStepNumber: number;
  stepLabels: string[];
  // Admin New order: a step already reached opens on tap, with what was entered kept.
  furthestStepNumber?: number;
  onStepClick?: (stepNumber: number) => void;
}

export function StepIndicatorDesktop({
  currentStepNumber,
  stepLabels,
  furthestStepNumber = currentStepNumber,
  onStepClick,
}: StepIndicatorDesktopProps) {
  const tx = useTranslate();

  return (
    <div className="flex items-center px-6 pt-6">
      {stepLabels.map((stepLabel, stepIndex) => {
        const stepNumber = stepIndex + 1;
        const isCompletedStep = stepNumber < currentStepNumber;
        const isCurrentStep = stepNumber === currentStepNumber;
        const isLastStep = stepIndex === stepLabels.length - 1;
        const isClickable =
          Boolean(onStepClick) && !isCurrentStep && stepNumber <= furthestStepNumber;

        return (
          <div key={stepLabel} className={cn("flex items-center", !isLastStep && "flex-1")}>
            <button
              type="button"
              disabled={!isClickable}
              aria-current={isCurrentStep ? "step" : undefined}
              onClick={() => onStepClick?.(stepNumber)}
              className={cn(
                "flex flex-col items-center gap-1.5 disabled:cursor-default",
                isClickable && "cursor-pointer",
              )}
            >
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
                {tx(stepLabel)}
              </p>
            </button>
            {!isLastStep && (
              <div className={cn("mx-2 h-0.5 flex-1", isCompletedStep ? "bg-brand" : "bg-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
