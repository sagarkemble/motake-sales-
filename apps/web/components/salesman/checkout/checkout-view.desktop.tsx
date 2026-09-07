"use client";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";

interface CheckoutViewDesktopProps {
  children: React.ReactNode;
  showBackButton: boolean;
  isNextDisabled: boolean;
  isNextLoading: boolean;
  nextButtonLabel: string;
  onBack: () => void;
  onNext: () => void;
}

export function CheckoutViewDesktop({
  children,
  showBackButton,
  isNextDisabled,
  isNextLoading,
  nextButtonLabel,
  onBack,
  onNext,
}: CheckoutViewDesktopProps) {
  const tx = useTranslate();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="rounded-2xl border bg-card p-6">{children}</div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {showBackButton && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-10 whitespace-normal rounded-full py-2"
            onClick={onBack}
          >
            {tx("Back")}
          </Button>
        )}
        <Button
          type="button"
          disabled={isNextDisabled || isNextLoading}
          onClick={onNext}
          className="h-auto min-h-10 whitespace-normal rounded-full bg-brand px-8 py-2 text-brand-foreground hover:bg-brand/90"
        >
          {isNextLoading ? tx("Please wait...") : nextButtonLabel}
        </Button>
      </div>
    </div>
  );
}
