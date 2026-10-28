"use client";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";

interface CheckoutViewMobileProps {
  children: React.ReactNode;
  showBackButton: boolean;
  isNextDisabled: boolean;
  isNextLoading: boolean;
  nextButtonLabel: string;
  // What blocks the primary button, shown above it.
  hint?: string | null;
  onBack: () => void;
  onNext: () => void;
}

export function CheckoutViewMobile({
  children,
  showBackButton,
  isNextDisabled,
  isNextLoading,
  nextButtonLabel,
  hint,
  onBack,
  onNext,
}: CheckoutViewMobileProps) {
  const tx = useTranslate();

  return (
    // Bottom padding clears the fixed footer (hint of up to three lines + one row of buttons) so the
    // last row is never hidden behind it.
    <div className="flex flex-col gap-4 px-4 pb-40 pt-4">
      {children}

      <div className="fixed inset-x-0 bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t border-border bg-background px-4 py-3">
        {hint && <p className="text-center text-xs text-muted-foreground">{hint}</p>}
        <div className="flex gap-2">
          {showBackButton && (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 shrink-0 whitespace-normal rounded-full px-5 py-2"
              onClick={onBack}
            >
              {tx("common.actions.back")}
            </Button>
          )}
          <Button
            type="button"
            disabled={isNextDisabled || isNextLoading}
            onClick={onNext}
            className="h-auto min-h-10 min-w-0 flex-1 whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90"
          >
            {isNextLoading ? tx("common.status.pleaseWait") : nextButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
