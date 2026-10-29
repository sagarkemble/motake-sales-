"use client";

import { ChevronRightIcon, MessageCircleIcon } from "lucide-react";
import { useState } from "react";

import {
  STATUS_ICON,
  STATUS_STYLE,
  WhatsappLoadError,
  WhatsappMessageList,
  WhatsappRefusal,
  WhatsappSkeleton,
  useMessageTitle,
  useResendMessage,
} from "~/components/shared/whatsapp/whatsapp-messages";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useCustomerMessages, type CustomerMessage } from "~/hooks/use-customer-messages";
import { useTranslate } from "~/hooks/use-translate";
import { displayStatus, worstStatus } from "~/lib/customer-messages";
import { refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

// The salesman only resends here; Send latest Bill is the office's.
const CONTEXT = { customerActive: true };

/**
 * Checkout result (Spec J): one pill with the Bill and Receipt status, re-read while they go out;
 * tapping it opens a bottom drawer with each message and Resend. The server refuses a salesman
 * off the Customer's Active GatePass Route, and that refusal is shown as it comes.
 */
export function CheckoutWhatsapp({
  shopName,
  billId,
  paymentId,
}: {
  shopName: string;
  billId: string | null;
  paymentId: string | null;
}) {
  const tx = useTranslate();
  const titleOf = useMessageTitle();
  const [open, setOpen] = useState(false);
  const bill = useCustomerMessages({
    document: { billId: billId ?? "" },
    live: true,
    enabled: billId != null,
  });
  const payment = useCustomerMessages({
    document: { paymentId: paymentId ?? "" },
    live: true,
    enabled: paymentId != null,
  });
  // Both lists go through the same Resend; either hook's mutation reloads both.
  const resend = useResendMessage(bill.resendAsync);

  // Bill first, then Receipt, the order they are sent in.
  const rows = [...(billId ? bill.messages : []), ...(paymentId ? payment.messages : [])];
  const isLoading =
    (billId != null && bill.isMessagesLoading) || (paymentId != null && payment.isMessagesLoading);
  const error = (billId ? bill.messagesError : null) ?? (paymentId ? payment.messagesError : null);
  const worst = worstStatus(rows);
  const Icon = worst && !error ? STATUS_ICON[worst] : MessageCircleIcon;

  function retry() {
    if (billId) void bill.refetchMessages();
    if (paymentId) void payment.refetchMessages();
  }

  function rowTitle(row: CustomerMessage) {
    if (row.kind === "bill") return tx("whatsapp.checkout.billPdf");
    if (row.kind === "receipt") return tx("whatsapp.checkout.receiptPdf");
    return titleOf(row);
  }

  const text = isLoading
    ? tx("whatsapp.checkout.checking")
    : error
      ? tx("whatsapp.checkout.unknown")
      : rows.length === 0
        ? tx("whatsapp.checkout.none")
        : rows
            .map((row) =>
              tx(
                row.kind === "receipt"
                  ? "whatsapp.checkout.receiptPart"
                  : "whatsapp.checkout.billPart",
                {
                  status: tx(`whatsapp.status.${displayStatus(row)}`).toLowerCase(),
                },
              ),
            )
            .join(" · ");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resend.clearRefusal();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn(
          "h-auto max-w-sm gap-2 rounded-full px-3 py-1.5",
          worst && !isLoading && !error ? STATUS_STYLE[worst] : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{tx("whatsapp.checkout.pill", { text })}</span>
        <ChevronRightIcon className="size-4 shrink-0 opacity-60" />
      </Button>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[85dvh]">
          <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
            <DrawerHeader className="text-left">
              <DrawerTitle>{tx("whatsapp.checkout.title", { shop: shopName })}</DrawerTitle>
              <DrawerDescription>{tx("whatsapp.checkout.description")}</DrawerDescription>
            </DrawerHeader>
            <ScrollArea className="flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
              <div className="flex flex-col gap-3 px-4 pb-6 text-left">
                {resend.refusal && (
                  <WhatsappRefusal
                    title={tx("whatsapp.resend.refused")}
                    message={resend.refusal}
                    onDismiss={resend.clearRefusal}
                  />
                )}
                {isLoading ? (
                  <WhatsappSkeleton />
                ) : error ? (
                  <WhatsappLoadError
                    message={refusalMessage(tx, error, tx("whatsapp.checkout.loadError"))}
                    retryLabel={tx("whatsapp.checkout.retry")}
                    onRetry={retry}
                  />
                ) : rows.length === 0 ? (
                  <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                    {tx("whatsapp.checkout.empty")}
                  </p>
                ) : (
                  <WhatsappMessageList
                    rows={rows}
                    context={CONTEXT}
                    resendingId={bill.resendingId}
                    onResend={(row) => void resend.resend(row)}
                    layout="cards"
                    titleOf={rowTitle}
                  />
                )}
                {billId && !paymentId && (
                  <p className="text-xs text-muted-foreground">
                    {tx("whatsapp.checkout.noReceipt")}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
