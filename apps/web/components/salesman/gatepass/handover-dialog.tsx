"use client";

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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useGatepasses } from "~/hooks/use-gatepasses";

interface HandoverDialogItem {
  id: string;
  productName: string;
  varietyName: string;
  unit: string;
  remainingQty: number;
}

interface HandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gatepassId: string;
  items: HandoverDialogItem[];
}

export function HandoverDialog({ open, onOpenChange, gatepassId, items }: HandoverDialogProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { submitHandoverAsync, isSubmittingHandover } = useGatepasses();

  const itemsWithStockToReturn = items.filter((item) => item.remainingQty > 0);
  const totalRemainingQty = itemsWithStockToReturn.reduce(
    (total, item) => total + item.remainingQty,
    0,
  );

  async function handleConfirmSubmit() {
    try {
      await submitHandoverAsync({ gatepassId });
      toast.success("Handover submitted");
      onOpenChange(false);
    } catch (submitHandoverError) {
      const errorMessage =
        submitHandoverError instanceof Error
          ? submitHandoverError.message
          : "Could not submit handover";
      toast.error(errorMessage);
    } finally {
      setIsConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return summary</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {itemsWithStockToReturn.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                You have no stock to return today.
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-2xl border">
                {itemsWithStockToReturn.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.productName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.varietyName} ({item.unit})
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium">{item.remainingQty}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 text-sm font-semibold">
                  <p>Total remaining</p>
                  <p>{totalRemainingQty}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              disabled={itemsWithStockToReturn.length === 0}
              onClick={() => setIsConfirmOpen(true)}
              className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Submit Handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit handover?</AlertDialogTitle>
            <AlertDialogDescription>
              You cannot change this after you submit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingHandover}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isSubmittingHandover} onClick={handleConfirmSubmit}>
              {isSubmittingHandover ? "Submitting..." : "Submit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
