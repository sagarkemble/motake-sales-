"use client";

import { PackageCheckIcon } from "lucide-react";
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
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { useGatepasses, type GatepassShortReason } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";

import { SHORT_REASON_LABEL_KEYS, type GatepassLine } from "~/lib/gatepass-quantities";

const SHORT_REASONS = Object.keys(SHORT_REASON_LABEL_KEYS) as GatepassShortReason[];

interface HandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gatepassId: string;
  lines: GatepassLine[];
}

export function HandoverDialog({ open, onOpenChange, gatepassId, lines }: HandoverDialogProps) {
  const tx = useTranslate();
  const [returnedByLine, setReturnedByLine] = useState<Record<string, number>>({});
  const [reasonByLine, setReasonByLine] = useState<Record<string, GatepassShortReason>>({});
  const [noteByLine, setNoteByLine] = useState<Record<string, string>>({});
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { submitHandoverAsync, isSubmittingHandover } = useGatepasses();

  // Sold-out lines have nothing to come back.
  const returnableLines = lines.filter((line) => line.sellableQty > 0);
  const soldOutLineCount = lines.length - returnableLines.length;

  // Returned starts at what is left (issued − sold) and can only go down from there.
  const returnedFor = (line: GatepassLine) =>
    Math.min(returnedByLine[line.id] ?? line.sellableQty, line.sellableQty);
  const shortFor = (line: GatepassLine) => line.sellableQty - returnedFor(line);

  const shortLines = returnableLines.filter((line) => shortFor(line) > 0);
  const linesMissingReason = shortLines.filter((line) => !reasonByLine[line.id]);
  const totalShort = shortLines.reduce((total, line) => total + shortFor(line), 0);

  function resetDraft() {
    setReturnedByLine({});
    setReasonByLine({});
    setNoteByLine({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetDraft();
    onOpenChange(next);
  }

  async function handleConfirmSubmit() {
    const payloadItems = returnableLines.map((line) => {
      const returnedQty = returnedFor(line);
      if (shortFor(line) === 0) return { gatepassItemId: line.id, returnedQty };
      const note = noteByLine[line.id]?.trim();
      return {
        gatepassItemId: line.id,
        returnedQty,
        shortReason: reasonByLine[line.id],
        ...(note ? { shortNote: note } : {}),
      };
    });

    try {
      await submitHandoverAsync({ gatepassId, items: payloadItems });
      toast.success(tx("salesman.handover.success"));
      handleOpenChange(false);
    } catch (submitHandoverError) {
      toast.error(getErrorMessage(submitHandoverError, tx("salesman.handover.failed")));
    } finally {
      setIsConfirmOpen(false);
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{tx("salesman.handover.title")}</DrawerTitle>
              <DrawerDescription>{tx("salesman.handover.intro")}</DrawerDescription>
            </DrawerHeader>

            {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
            <ScrollArea className="flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
              <div className="flex flex-col gap-3 px-4 pb-2">
                {returnableLines.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
                    <PackageCheckIcon className="size-6 text-muted-foreground" />
                    <p className="text-sm font-medium">{tx("salesman.handover.nothingToReturn")}</p>
                  </div>
                ) : (
                  returnableLines.map((line) => {
                    const short = shortFor(line);
                    return (
                      <div
                        key={line.id}
                        className={cn(
                          "rounded-2xl border bg-card p-3",
                          short > 0 && "border-amber-500/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{line.productName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {line.varietyName} ({line.unit})
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                              {tx("salesman.handover.lineQuantities", {
                                issued: line.issuedQty,
                                sold: line.soldQty,
                                left: line.sellableQty,
                              })}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-muted-foreground">
                              {tx("salesman.gatepass.col.returned")}
                            </span>
                            <QuantityStepper
                              quantity={returnedFor(line)}
                              minQuantity={0}
                              onQuantityChange={(next) =>
                                setReturnedByLine((prev) => ({
                                  ...prev,
                                  [line.id]: Math.min(next, line.sellableQty),
                                }))
                              }
                            />
                          </div>
                        </div>

                        {short > 0 && (
                          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
                            <p className="text-xs font-medium text-amber-700">
                              {tx("salesman.handover.shortWhy", { short, left: line.sellableQty })}
                            </p>
                            <ToggleGroup
                              type="single"
                              variant="outline"
                              size="sm"
                              spacing={1}
                              value={reasonByLine[line.id] ?? ""}
                              onValueChange={(value) =>
                                value &&
                                setReasonByLine((prev) => ({
                                  ...prev,
                                  [line.id]: value as GatepassShortReason,
                                }))
                              }
                              className="w-full flex-wrap gap-1.5"
                            >
                              {SHORT_REASONS.map((reason) => (
                                <ToggleGroupItem
                                  key={reason}
                                  value={reason}
                                  className="h-7 rounded-full bg-background px-2.5 text-xs font-medium data-[state=on]:bg-accent data-[state=on]:text-brand"
                                >
                                  {tx(SHORT_REASON_LABEL_KEYS[reason])}
                                </ToggleGroupItem>
                              ))}
                            </ToggleGroup>
                            <Textarea
                              rows={1}
                              value={noteByLine[line.id] ?? ""}
                              onChange={(event) =>
                                setNoteByLine((prev) => ({
                                  ...prev,
                                  [line.id]: event.target.value,
                                }))
                              }
                              placeholder={tx("salesman.handover.notePlaceholder")}
                              className="min-h-8 resize-none rounded-lg text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {soldOutLineCount > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    {tx("salesman.handover.soldOutLines", { count: soldOutLineCount })}
                  </p>
                )}
              </div>
            </ScrollArea>

            <DrawerFooter>
              <p className="text-center text-xs text-muted-foreground">
                {totalShort > 0
                  ? tx("salesman.handover.summaryShort", {
                      count: totalShort,
                      lines: shortLines.length,
                      missing: linesMissingReason.length,
                    })
                  : tx("salesman.handover.summaryFull")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-10 w-full whitespace-normal rounded-full py-2 sm:flex-1"
                  onClick={() => handleOpenChange(false)}
                >
                  {tx("common.actions.cancel")}
                </Button>
                <Button
                  type="button"
                  className="h-auto min-h-10 w-full whitespace-normal rounded-full bg-brand py-2 text-brand-foreground hover:bg-brand/90 sm:flex-1"
                  disabled={linesMissingReason.length > 0}
                  onClick={() => setIsConfirmOpen(true)}
                >
                  {tx("salesman.handover.cta")}
                </Button>
              </div>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("salesman.handover.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {totalShort > 0
                ? tx("salesman.handover.confirmBodyWithShort", { count: totalShort })
                : tx("salesman.handover.confirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingHandover} className="rounded-full">
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmittingHandover}
              onClick={handleConfirmSubmit}
              className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isSubmittingHandover ? tx("common.actions.sending") : tx("common.actions.send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
