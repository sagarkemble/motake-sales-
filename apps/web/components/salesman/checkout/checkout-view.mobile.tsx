"use client";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";

interface CheckoutViewMobileProps {
  children: React.ReactNode;
  showBackButton: boolean;
  isNextDisabled: boolean;
  isNextLoading: boolean;
  nextButtonLabel: string;
  onBack: () => void;
  onNext: () => void;
}

export function CheckoutViewMobile({
  children,
  showBackButton,
  isNextDisabled,
  isNextLoading,
  nextButtonLabel,
  onBack,
  onNext,
}: CheckoutViewMobileProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      {children}

      <div className="fixed inset-x-0 bottom-16 z-30 flex flex-col gap-2 border-t border-border bg-background px-4 py-3 sm:flex-row">
        {showBackButton && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-10 w-full whitespace-normal rounded-full py-2 sm:w-auto"
            onClick={onBack}
          >
            {tx("common.actions.back")}
          </Button>
        )}
        <Button
          type="button"
          disabled={isNextDisabled || isNextLoading}
          onClick={onNext}
          className="h-auto min-h-10 w-full flex-1 whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90"
        >
          {isNextLoading ? tx("common.status.pleaseWait") : nextButtonLabel}
        </Button>
      </div>
    </div>
  );
}
