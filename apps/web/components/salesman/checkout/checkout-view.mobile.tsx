import { Button } from "~/components/ui/button";

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
  return (
    <div className="flex flex-col gap-4 px-4 pb-28 pt-4">
      {children}

      <div className="fixed inset-x-0 bottom-16 z-30 flex gap-2 border-t border-border bg-background px-4 py-3">
        {showBackButton && (
          <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
            Back
          </Button>
        )}
        <Button
          type="button"
          disabled={isNextDisabled || isNextLoading}
          onClick={onNext}
          className="flex-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isNextLoading ? "Please wait..." : nextButtonLabel}
        </Button>
      </div>
    </div>
  );
}
