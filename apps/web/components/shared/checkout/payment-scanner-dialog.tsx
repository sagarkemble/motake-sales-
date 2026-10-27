"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useTranslate } from "~/hooks/use-translate";

interface PaymentScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Placeholder company UPI QR; the real QR is not wired yet. */
export function PaymentScannerDialog({ open, onOpenChange }: PaymentScannerDialogProps) {
  const tx = useTranslate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold">
            {tx("checkout.payment.scannerTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center">
          <img
            src="https://images.unsplash.com/photo-1595079676339-1534801ad6cf?w=400&h=400&fit=crop"
            alt={tx("checkout.payment.scannerAlt")}
            className="size-64 rounded-2xl border border-border object-cover shadow-sm"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
