"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

const SHORT_REASONS = [
  { value: "damaged", label: "salesman.handover.reason.damaged" },
  { value: "expired", label: "salesman.handover.reason.expired" },
  { value: "lost", label: "salesman.handover.reason.lost" },
  { value: "leaked", label: "salesman.handover.reason.leaked" },
  { value: "other", label: "salesman.handover.reason.other" },
] as const;

type ShortReasonValue = (typeof SHORT_REASONS)[number]["value"];

interface HandoverDialogItem {
  id: string;
  productName: string;
  varietyName: string;
  unit: string;
  issuedQty: number;
  soldQty: number;
  remainingQty: number;
}

interface HandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gatepassId: string;
  items: HandoverDialogItem[];
}

const WIZARD_STEPS = [
  { step: 1, label: "salesman.handover.step.confirmReturns" },
  { step: 2, label: "salesman.handover.step.explain" },
  { step: 3, label: "salesman.handover.step.review" },
] as const;

function StepHeader({ currentStep }: { currentStep: number }) {
  const tx = useTranslate();

  return (
    <div className="flex items-start gap-1">
      {WIZARD_STEPS.map(({ step, label }, index) => {
        const isDone = step < currentStep;
        const isActive = step === currentStep;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-start gap-1">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isActive && "bg-brand text-brand-foreground",
                  isDone && "bg-brand/15 text-brand",
                  !isActive && !isDone && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" /> : step}
              </span>
              <span
                className={cn(
                  "w-full text-center text-[10px] leading-tight font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {tx(label)}
              </span>
            </div>
            {index < WIZARD_STEPS.length - 1 && (
              <span className="mt-3 h-px min-w-2 flex-1 bg-border" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HandoverDialog({ open, onOpenChange, gatepassId, items }: HandoverDialogProps) {
  const tx = useTranslate();
  const [step, setStep] = useState(1);
  const [returnedByItem, setReturnedByItem] = useState<Record<string, number>>({});
  const [reasonByItem, setReasonByItem] = useState<Record<string, ShortReasonValue>>({});
  const [noteByItem, setNoteByItem] = useState<Record<string, string>>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { submitHandoverAsync, isSubmittingHandover } = useGatepasses();

  const returnableItems = items.filter((item) => item.remainingQty > 0);

  const returnedFor = (item: HandoverDialogItem) => {
    const value = returnedByItem[item.id];
    if (value === undefined) return item.remainingQty;
    return Math.min(Math.max(value, 0), item.remainingQty);
  };
  const shortFor = (item: HandoverDialogItem) => item.remainingQty - returnedFor(item);

  const differingItems = returnableItems.filter((item) => shortFor(item) > 0);
  const allDifferencesExplained = differingItems.every((item) => Boolean(reasonByItem[item.id]));

  const totalExpected = returnableItems.reduce((total, item) => total + item.remainingQty, 0);
  const totalReturning = returnableItems.reduce((total, item) => total + returnedFor(item), 0);
  const totalShort = totalExpected - totalReturning;

  function resetWizard() {
    setStep(1);
    setReturnedByItem({});
    setReasonByItem({});
    setNoteByItem({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetWizard();
    onOpenChange(next);
  }

  async function handleConfirmSubmit() {
    const payloadItems = returnableItems.map((item) => {
      const returnedQty = returnedFor(item);
      const short = item.remainingQty - returnedQty;
      if (short > 0) {
        const note = noteByItem[item.id]?.trim();
        return {
          gatepassItemId: item.id,
          returnedQty,
          shortReason: reasonByItem[item.id],
          ...(note ? { shortNote: note } : {}),
        };
      }
      return { gatepassItemId: item.id, returnedQty };
    });

    try {
      await submitHandoverAsync({ gatepassId, items: payloadItems });
      toast.success(tx("salesman.handover.success"));
      handleOpenChange(false);
    } catch (submitHandoverError) {
      const errorMessage =
        submitHandoverError instanceof Error
          ? submitHandoverError.message
          : tx("salesman.handover.failed");
      toast.error(errorMessage);
    } finally {
      setIsConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[88vh] flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Handover</DialogTitle>
          </DialogHeader>

          <StepHeader currentStep={step} />

          <div className="-mx-1 flex-1 overflow-y-auto px-1">
            {returnableItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                You have no stock to return today. You can still send this for approval.
              </p>
            ) : step === 1 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Confirm how many units you are actually returning. We&apos;ve pre-filled the amount
                  due back.
                </p>
                {returnableItems.map((item) => {
                  const returned = returnedFor(item);
                  const short = item.remainingQty - returned;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-2xl border bg-card p-3",
                        short > 0 && "border-amber-500/40 bg-amber-500/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.productName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {item.varietyName} ({item.unit})
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Given {item.issuedQty} · Sold {item.soldQty} · Due back{" "}
                            {item.remainingQty}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-muted-foreground">Returning</span>
                          <QuantityStepper
                            quantity={returned}
                            minQuantity={0}
                            onQuantityChange={(next) =>
                              setReturnedByItem((prev) => ({
                                ...prev,
                                [item.id]: Math.min(next, item.remainingQty),
                              }))
                            }
                          />
                        </div>
                      </div>
                      {short > 0 && (
                        <Badge
                          variant="outline"
                          className="mt-2 border-transparent bg-amber-500/10 text-amber-600"
                        >
                          Short by {short}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : step === 2 ? (
              <div className="flex flex-col gap-3">
                {differingItems.length === 0 ? (
                  <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 text-center">
                    <p className="text-sm font-medium">Nothing to explain</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Every item is coming back in full. Go straight to review.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Tell the owner why these items are short. A reason is required for each.
                    </p>
                    {differingItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium">
                            {item.productName} · {item.varietyName}
                          </p>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-transparent bg-amber-500/10 text-amber-600"
                          >
                            Short {shortFor(item)} of {item.remainingQty}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {SHORT_REASONS.map((reason) => {
                            const isSelected = reasonByItem[item.id] === reason.value;
                            return (
                              <button
                                key={reason.value}
                                type="button"
                                onClick={() =>
                                  setReasonByItem((prev) => ({ ...prev, [item.id]: reason.value }))
                                }
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                  isSelected
                                    ? "border-brand bg-brand text-brand-foreground"
                                    : "border-input bg-background text-foreground hover:bg-muted",
                                )}
                              >
                                {tx(reason.label)}
                              </button>
                            );
                          })}
                        </div>
                        <Textarea
                          rows={2}
                          value={noteByItem[item.id] ?? ""}
                          onChange={(event) =>
                            setNoteByItem((prev) => ({ ...prev, [item.id]: event.target.value }))
                          }
                          placeholder="Add a short note (optional)…"
                          className="mt-3 resize-none rounded-xl text-sm"
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Ideal return</p>
                    <p className="text-lg font-semibold">{totalExpected}</p>
                  </div>
                  <div className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Returning</p>
                    <p className="text-lg font-semibold text-brand">{totalReturning}</p>
                  </div>
                  <div className="rounded-2xl border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Short</p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        totalShort > 0 ? "text-amber-600" : "text-foreground",
                      )}
                    >
                      {totalShort}
                    </p>
                  </div>
                </div>

                {differingItems.length === 0 ? (
                  <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 text-center">
                    <p className="text-sm font-medium">Full return</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      You&apos;re returning everything due back. No shortfalls to report.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y rounded-2xl border">
                    {differingItems.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {item.productName} · {item.varietyName}
                          </p>
                          {noteByItem[item.id]?.trim() && (
                            <p className="truncate text-xs text-muted-foreground">
                              {noteByItem[item.id]}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-transparent bg-amber-500/10 text-amber-600 capitalize"
                          >
                            {reasonByItem[item.id] ?? "—"}
                          </Badge>
                          <span className="text-sm font-medium">Short {shortFor(item)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full whitespace-normal rounded-full py-2 sm:flex-1"
                onClick={() => setStep((prev) => prev - 1)}
              >
                {tx("common.actions.back")}
              </Button>
            )}
            {step < 3 ? (
              <Button
                type="button"
                className="h-auto min-h-10 w-full whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90 sm:flex-1"
                disabled={step === 2 && !allDifferencesExplained}
                onClick={() => setStep((prev) => prev + 1)}
              >
                {step === 1 && totalShort > 0
                  ? tx("salesman.handover.next.explainShort", { count: totalShort })
                  : tx("salesman.handover.next.review")}
              </Button>
            ) : (
              <Button
                type="button"
                className="h-auto min-h-10 w-full whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90 sm:flex-1"
                onClick={() => setIsConfirmOpen(true)}
              >
                {tx("salesman.handover.cta")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("salesman.handover.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {totalShort > 0
                ? tx(
                    "salesman.handover.confirmBodyWithShort",
                    { count: totalShort },
                  )
                : tx(
                    "salesman.handover.confirmBody",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingHandover}>{tx("common.actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={isSubmittingHandover} onClick={handleConfirmSubmit}>
              {isSubmittingHandover ? tx("common.actions.sending") : tx("common.actions.send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
