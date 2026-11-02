"use client";

import { QrCodeIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useTranslate } from "~/hooks/use-translate";

interface PaymentScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The company UPI QR the shop scans to pay; it records nothing. */
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
          <Image
            src="/upi-qr.png"
            width={382}
            height={421}
            alt={tx("checkout.payment.scannerAlt")}
            className="w-64 rounded-2xl border border-border bg-white object-contain p-2 shadow-sm"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Open payment scanner" with its dialog, for any form whose mode is UPI. */
export function PaymentScannerButton() {
  const tx = useTranslate();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full gap-3 rounded-2xl border-brand/30 bg-accent text-base font-semibold text-brand-deep hover:bg-accent-deep"
        onClick={() => setIsScannerOpen(true)}
      >
        <QrCodeIcon className="size-5" />
        {tx("checkout.payment.openScanner")}
      </Button>
      <PaymentScannerDialog open={isScannerOpen} onOpenChange={setIsScannerOpen} />
    </>
  );
}
