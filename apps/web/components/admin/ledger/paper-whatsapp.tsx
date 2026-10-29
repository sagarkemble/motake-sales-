"use client";

import { AlertCircleIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  STATUS_ICON,
  STATUS_STYLE,
  WhatsappLoadError,
  WhatsappMessageList,
  WhatsappRefusal,
  WhatsappSkeleton,
  useResendMessage,
} from "~/components/shared/whatsapp/whatsapp-messages";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import {
  useCustomerMessages,
  type CustomerMessage,
  type CustomerMessagesState,
  type MessageDocument,
} from "~/hooks/use-customer-messages";
import { useTranslate } from "~/hooks/use-translate";
import { sendLatestBlockKey, worstStatus, type ResendContext } from "~/lib/customer-messages";
import { refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

const BRAND_BUTTON = "bg-brand text-brand-foreground hover:bg-brand/90";

export interface LatestBillInfo {
  billId: string;
  number: string;
  version: number;
  // "Pending ₹1,234.00": what today's message will show.
  balanceText: string;
  cancelled: boolean;
  irnPending: boolean;
}

/**
 * The paper's one compact WhatsApp entry ("WhatsApp · Delivered · 2") and its Dialog: the
 * paper's messages with status, reason and Resend, and on a Bill paper Send latest Bill. A
 * deactivated Customer's paper shows the list only.
 */
export function PaperWhatsapp({
  document,
  title,
  context,
  latestBill,
  detailOf,
  className,
}: {
  document: MessageDocument;
  // "Bill MB/26-27/000014", for the Dialog title.
  title: string;
  context: ResendContext;
  latestBill?: LatestBillInfo;
  detailOf?: (row: CustomerMessage) => string | null;
  className?: string;
}) {
  const tx = useTranslate();
  const [open, setOpen] = useState(false);
  const state = useCustomerMessages({ document });
  const { messages, isMessagesLoading, messagesError } = state;
  const resend = useResendMessage(state.resendAsync);
  const [latestRefusal, setLatestRefusal] = useState<string | null>(null);
  const worst = worstStatus(messages);
  const busy = state.resendingId != null || state.isSendingLatestBill;
  const Icon = messagesError ? AlertCircleIcon : worst ? STATUS_ICON[worst] : MessageCircleIcon;

  let label: string;
  if (isMessagesLoading) label = tx("whatsapp.entry.loading");
  else if (messagesError) label = tx("whatsapp.entry.error");
  else if (!worst) label = tx("whatsapp.entry.none");
  else
    label = tx("whatsapp.entry.label", {
      status: tx(`whatsapp.status.${worst}`),
      count: messages.length,
    });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      resend.clearRefusal();
      setLatestRefusal(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isMessagesLoading}
        onClick={() => setOpen(true)}
        className={cn(
          "w-fit max-w-full gap-1.5 rounded-full",
          !isMessagesLoading && !messagesError && worst && STATUS_STYLE[worst],
          messagesError && "border-destructive/40 text-destructive",
          className,
        )}
      >
        {isMessagesLoading || busy ? <Spinner /> : <Icon />}
        <span className="truncate">{label}</span>
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 rounded-2xl p-0 sm:max-w-lg">
          {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
          <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            <div className="flex flex-col gap-4 p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>{tx("whatsapp.dialog.title", { paper: title })}</DialogTitle>
                <DialogDescription>{tx("whatsapp.dialog.description")}</DialogDescription>
              </DialogHeader>
              {resend.refusal && (
                <WhatsappRefusal
                  title={tx("whatsapp.resend.refused")}
                  message={resend.refusal}
                  onDismiss={resend.clearRefusal}
                />
              )}
              {latestRefusal && (
                <WhatsappRefusal
                  title={tx("whatsapp.latest.refused")}
                  message={latestRefusal}
                  onDismiss={() => setLatestRefusal(null)}
                />
              )}
              {isMessagesLoading ? (
                <WhatsappSkeleton />
              ) : messagesError ? (
                <WhatsappLoadError
                  message={tx("whatsapp.dialog.loadError")}
                  retryLabel={tx("whatsapp.dialog.retry")}
                  onRetry={() => void state.refetchMessages()}
                />
              ) : messages.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {tx("whatsapp.dialog.empty")}
                </p>
              ) : (
                <WhatsappMessageList
                  rows={messages}
                  context={context}
                  resendingId={state.resendingId}
                  onResend={(row) => void resend.resend(row)}
                  detailOf={detailOf}
                />
              )}
              {latestBill && !isMessagesLoading && !messagesError && (
                <>
                  <Separator />
                  <SendLatestBill
                    state={state}
                    info={latestBill}
                    customerActive={context.customerActive}
                    onRefused={setLatestRefusal}
                  />
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SendLatestBill({
  state,
  info,
  customerActive,
  onRefused,
}: {
  state: CustomerMessagesState;
  info: LatestBillInfo;
  customerActive: boolean;
  onRefused: (message: string | null) => void;
}) {
  const tx = useTranslate();
  const [confirm, setConfirm] = useState(false);
  const block = sendLatestBlockKey({
    cancelled: info.cancelled,
    irnPending: info.irnPending,
    customerActive,
  });
  const sending = state.isSendingLatestBill;

  async function send() {
    onRefused(null);
    try {
      await state.sendLatestBillAsync({ billId: info.billId });
      toast.success(tx("whatsapp.latest.done"));
    } catch (error) {
      onRefused(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        className={cn("w-full rounded-full", BRAND_BUTTON)}
        disabled={block != null || sending || state.resendingId != null}
        onClick={() => setConfirm(true)}
      >
        {sending ? <Spinner /> : <SendIcon />}
        {tx("whatsapp.latest.button")}
      </Button>
      <p className="text-xs text-muted-foreground">
        {block
          ? tx(`whatsapp.block.${block}`)
          : tx("whatsapp.latest.hint", { version: info.version })}
      </p>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("whatsapp.latest.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx("whatsapp.latest.confirmBody", {
                number: info.number,
                version: info.version,
                balance: info.balanceText,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn("rounded-full", BRAND_BUTTON)}
              onClick={() => void send()}
            >
              {tx("whatsapp.latest.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
