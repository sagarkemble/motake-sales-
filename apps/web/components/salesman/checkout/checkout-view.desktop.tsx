import { Button } from "~/components/ui/button";

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
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="rounded-2xl border bg-card p-6">{children}</div>

      <div className="flex justify-end gap-2">
        {showBackButton && (
          <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
            Back
          </Button>
        )}
        <Button
          type="button"
          disabled={isNextDisabled || isNextLoading}
          onClick={onNext}
          className="rounded-full bg-brand px-8 text-brand-foreground hover:bg-brand/90"
        >
          {isNextLoading ? "Please wait..." : nextButtonLabel}
        </Button>
      </div>
    </div>
  );
}
