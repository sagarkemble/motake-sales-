"use client";

import { BillPaper } from "~/components/admin/bills/bill-paper";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useBills } from "~/hooks/use-bills";
import { useTranslate } from "~/hooks/use-translate";

interface BillDetailDialogProps {
  billId: string | null;
  onOpenChange: (open: boolean) => void;
  onOpenOrder?: (orderId: string) => void;
}

export function BillDetailDialog({ billId, onOpenChange, onOpenOrder }: BillDetailDialogProps) {
  const tx = useTranslate();
  const { bill, isBillLoading, refetchBill } = useBills({ billId: billId ?? undefined });

  return (
    <Dialog open={Boolean(billId)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 rounded-2xl p-0 sm:max-w-4xl">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle className="sr-only">
                {bill ? bill.number : tx("admin.bills.detailTitle")}
              </DialogTitle>
            </DialogHeader>

            {isBillLoading ? (
              <CardDetailSkeleton />
            ) : !bill ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">{tx("admin.bills.loadFailed")}</p>
                <Button type="button" variant="outline" onClick={() => refetchBill()}>
                  {tx("common.actions.tryAgain")}
                </Button>
              </div>
            ) : (
              <BillPaper bill={bill} onOpenOrder={onOpenOrder} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
