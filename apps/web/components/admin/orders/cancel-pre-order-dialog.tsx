"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ReasonField, RefusalAlert } from "~/components/admin/ledger/ledger-shared";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Spinner } from "~/components/ui/spinner";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

/** The red "Cancel Pre-order" button; the reason dialog is CancelPreOrderDialog. */
export function CancelPreOrderButton({
  onClick,
  size,
  className,
}: {
  onClick: () => void;
  size?: "sm" | "default";
  className?: string;
}) {
  const tx = useTranslate();
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      className={cn(
        "rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
      onClick={(event) => {
        // Inside a clickable order row: cancelling must not also open the row.
        event.stopPropagation();
        onClick();
      }}
    >
      {tx("admin.ledger.preorder.cancel")}
    </Button>
  );
}

interface CancelPreOrderDialogProps {
  /** The open Pre-order to cancel; null keeps the dialog closed. */
  orderId: string | null;
  onClose: () => void;
}

/** Admin cancels an open Pre-order with a reason; it never reached the Ledger. */
export function CancelPreOrderDialog({ orderId, onClose }: CancelPreOrderDialogProps) {
  const tx = useTranslate();
  const { cancelOrderAsync, isCancellingOrder } = useOrders();
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  function close() {
    setReason("");
    setRefusal(null);
    onClose();
  }

  async function handleCancel() {
    if (!orderId || reason.trim() === "" || isCancellingOrder) return;
    setRefusal(null);
    try {
      await cancelOrderAsync({ id: orderId, reason: reason.trim() });
      toast.success(tx("admin.ledger.preorder.done"));
      close();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && !isCancellingOrder && close()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tx("admin.ledger.preorder.cancel")}</DialogTitle>
          <DialogDescription>{tx("admin.ledger.preorder.cancelBody")}</DialogDescription>
        </DialogHeader>
        <ReasonField
          id="preorder-reason"
          value={reason}
          onChange={setReason}
          disabled={isCancellingOrder}
          placeholder={tx("admin.ledger.preorder.placeholder")}
        />
        {refusal && <RefusalAlert message={refusal} />}
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={isCancellingOrder}
            onClick={close}
          >
            {tx("common.actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="rounded-full"
            disabled={reason.trim() === "" || isCancellingOrder}
            onClick={handleCancel}
          >
            {isCancellingOrder && <Spinner />}
            {tx("admin.ledger.preorder.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
