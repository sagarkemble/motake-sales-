"use client";

import {
  AlertCircleIcon,
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  PauseCircleIcon,
  PhoneOffIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { CustomerMessage } from "~/hooks/use-customer-messages";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import {
  billVersionOf,
  displayStatus,
  hasPdf,
  reasonKey,
  resendBlockKey,
  templateOf,
  type DisplayStatus,
  type ResendContext,
} from "~/lib/customer-messages";
import { refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

// Spec J: the WhatsApp status pieces shared by the Admin papers (Dialog) and the salesman
// checkout result (Drawer): status badge, message list with reason and Resend, and the states.

const BRAND_BUTTON = "bg-brand text-brand-foreground hover:bg-brand/90";

export const STATUS_STYLE: Record<DisplayStatus, string> = {
  waiting: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-muted text-foreground",
  held: "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
  delivered: "border-transparent bg-brand/10 text-brand-deep dark:text-brand",
  read: "border-transparent bg-brand text-brand-foreground",
  failed: "border-transparent bg-destructive/10 text-destructive",
  superseded: "border-dashed text-muted-foreground line-through decoration-muted-foreground/60",
  skipped: "border-amber-500/40 bg-transparent text-amber-800 dark:text-amber-300",
};

export const STATUS_ICON: Record<DisplayStatus, typeof CheckIcon> = {
  waiting: ClockIcon,
  sent: CheckIcon,
  held: PauseCircleIcon,
  delivered: CheckCheckIcon,
  read: CheckCheckIcon,
  failed: AlertCircleIcon,
  superseded: BanIcon,
  skipped: PhoneOffIcon,
};

/** "Bill v2", "Receipt", "GST Debit Note". */
export function useMessageTitle() {
  const tx = useTranslate();
  return useCallback(
    (row: CustomerMessage) => {
      const version = billVersionOf(row);
      return version
        ? tx("whatsapp.template.billVersion", { version })
        : tx(`whatsapp.template.${templateOf(row)}`);
    },
    [tx],
  );
}

export function MessageStatusBadge({
  row,
  sending = false,
}: {
  row: CustomerMessage;
  sending?: boolean;
}) {
  const tx = useTranslate();
  const shown = displayStatus(row);
  const Icon = STATUS_ICON[shown];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("shrink-0 gap-1", STATUS_STYLE[shown])}>
          {sending ? <Spinner className="size-3" /> : <Icon />}
          {sending ? tx("whatsapp.status.sending") : tx(`whatsapp.status.${shown}`)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tx(`whatsapp.hint.${shown}`)}</TooltipContent>
    </Tooltip>
  );
}

function ReasonLine({ row }: { row: CustomerMessage }) {
  const tx = useTranslate();
  const key = reasonKey(row);
  if (!key) return null;
  const shown = displayStatus(row);
  return (
    <p
      className={cn(
        "text-xs",
        shown === "failed" && "text-destructive",
        (shown === "held" || shown === "skipped") && "text-amber-800 dark:text-amber-300",
        shown === "superseded" && "text-muted-foreground",
      )}
    >
      {tx(`whatsapp.reason.${key}`)}
    </p>
  );
}

/** A refused Resend or Send latest Bill, in the server's plain words. */
export function WhatsappRefusal({
  message,
  title,
  onDismiss,
}: {
  message: string;
  title: string;
  onDismiss?: () => void;
}) {
  const tx = useTranslate();
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onDismiss && (
          <Button size="sm" variant="ghost" className="-ml-2 h-7" onClick={onDismiss}>
            {tx("checkout.refusal.dismiss")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function WhatsappLoadError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <p className="flex items-start gap-1.5 text-destructive">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
        {message}
      </p>
      <Button size="sm" variant="outline" className="rounded-full" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

export function WhatsappSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

/**
 * Resend with toast on success and the refusal kept for the list to show; the list reloads
 * either way (the hook invalidates on settle).
 */
export function useResendMessage(
  resendAsync: (input: { notificationId: string }) => Promise<unknown>,
) {
  const tx = useTranslate();
  const titleOf = useMessageTitle();
  const [refusal, setRefusal] = useState<string | null>(null);

  async function resend(row: CustomerMessage) {
    setRefusal(null);
    try {
      await resendAsync({ notificationId: row.notificationId });
      toast.success(tx("whatsapp.resend.done", { message: titleOf(row) }));
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return { resend, refusal, setRefusal, clearRefusal: () => setRefusal(null) };
}

function ResendButton({
  row,
  sending,
  disabled,
  fullWidth,
  onConfirm,
}: {
  row: CustomerMessage;
  sending: boolean;
  disabled: boolean;
  fullWidth: boolean;
  onConfirm: () => void;
}) {
  const tx = useTranslate();
  const titleOf = useMessageTitle();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={fullWidth ? "default" : "sm"}
        variant="outline"
        className={cn("rounded-full", fullWidth ? "w-full" : "w-fit")}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {sending ? <Spinner /> : <RefreshCwIcon />}
        {tx("whatsapp.resend.button")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("whatsapp.resend.confirmTitle", { message: titleOf(row) })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(hasPdf(row) ? "whatsapp.resend.confirmBodyPdf" : "whatsapp.resend.confirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction className={cn("rounded-full", BRAND_BUTTON)} onClick={onConfirm}>
              {tx("whatsapp.resend.button")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export interface WhatsappMessageListProps {
  rows: CustomerMessage[];
  context: ResendContext;
  resendingId: string | null;
  onResend: (row: CustomerMessage) => void;
  // "divided": compact rows in the Admin Dialog; "cards": one bordered card per message with a
  // full-width Resend, for the salesman's phone.
  layout?: "divided" | "cards";
  // Overrides the template title (checkout: "Bill (PDF)").
  titleOf?: (row: CustomerMessage) => string;
  // A short extra next to the title (Bill paper: the Note's number).
  detailOf?: (row: CustomerMessage) => string | null;
}

/** The messages, newest first as the server gives them, each with status, time, reason, Resend. */
export function WhatsappMessageList({
  rows,
  context,
  resendingId,
  onResend,
  layout = "divided",
  titleOf,
  detailOf,
}: WhatsappMessageListProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const templateTitle = useMessageTitle();
  const cards = layout === "cards";
  return (
    <ul className={cards ? "flex flex-col gap-2" : "divide-y"}>
      {rows.map((row) => {
        const shown = displayStatus(row);
        const block = resendBlockKey(row, context);
        const sending = resendingId === row.notificationId;
        const detail = detailOf?.(row);
        return (
          <li
            key={row.notificationId}
            className={cn(
              "flex flex-col gap-1.5",
              cards ? "rounded-2xl border p-3" : "py-2.5 first:pt-0 last:pb-0",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    shown === "superseded" && "text-muted-foreground",
                  )}
                >
                  {titleOf ? titleOf(row) : templateTitle(row)}
                  {detail && (
                    <span className="ml-1.5 font-mono text-xs font-normal break-all text-muted-foreground">
                      {detail}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(row.updatedAt, "d MMM, h:mm a")}
                  {hasPdf(row) && ` · ${tx("whatsapp.withPdf")}`}
                  {row.attemptCount > 1 &&
                    ` · ${tx("whatsapp.tries", { count: row.attemptCount })}`}
                </p>
              </div>
              <MessageStatusBadge row={row} sending={sending} />
            </div>
            <ReasonLine row={row} />
            {block ? (
              <p className="text-xs text-muted-foreground">{tx(`whatsapp.block.${block}`)}</p>
            ) : (
              <ResendButton
                row={row}
                sending={sending}
                disabled={resendingId != null}
                fullWidth={cards}
                onConfirm={() => onResend(row)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
