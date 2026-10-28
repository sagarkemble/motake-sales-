"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  KeyRoundIcon,
  MessageCircleIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import { useWhatsAppToken, type WhatsAppTokenSettings } from "~/hooks/use-whatsapp-token";
import { getErrorMessage } from "~/lib/get-error-message";
import { refusalOf } from "~/lib/refusal";
import { cn } from "~/lib/utils";

const brandButton = "rounded-full bg-brand text-brand-foreground hover:bg-brand/90";
const DATE_TIME_PATTERN = "d MMM yyyy, h:mm a";

type Tx = ReturnType<typeof useTranslate>;

// Copy for a refused token call: the locale string for its reason, else the server's message.
function tokenRefusalMessage(tx: Tx, error: unknown): string {
  const refusal = refusalOf(error);
  if (refusal) {
    const key = `admin.whatsappToken.refusals.${refusal.reason}`;
    const message = tx(key);
    if (message !== key) return message;
  }
  return getErrorMessage(error, tx("admin.whatsappToken.refusals.generic"));
}

function waitingLabel(tx: Tx, count: number) {
  return count === 1
    ? tx("admin.whatsappToken.facts.waitingOne")
    : tx("admin.whatsappToken.facts.waitingOther", { count });
}

function StatusBadge({ state }: { state: WhatsAppTokenSettings["state"] }) {
  const tx = useTranslate();
  if (state === "ok") {
    return (
      <Badge className="border-transparent bg-brand/10 text-brand">
        <CheckCircle2Icon /> {tx("admin.whatsappToken.status.ok")}
      </Badge>
    );
  }
  if (state === "invalid") {
    return (
      <Badge variant="destructive">
        <XCircleIcon /> {tx("admin.whatsappToken.status.invalid")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <CircleHelpIcon />
      {state === "unavailable"
        ? tx("admin.whatsappToken.status.unavailable")
        : tx("admin.whatsappToken.status.unknown")}
    </Badge>
  );
}

function TokenFacts({ status }: { status: WhatsAppTokenSettings }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const held = status.heldCount;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">{tx("admin.whatsappToken.facts.status")}</dt>
      <dd className="min-w-0">
        <StatusBadge state={status.state} />
      </dd>
      <dt className="text-muted-foreground">{tx("admin.whatsappToken.facts.checkedAt")}</dt>
      <dd className="min-w-0 break-words">
        {status.checkedAt ? (
          formatDate(status.checkedAt, DATE_TIME_PATTERN)
        ) : (
          <span className="text-muted-foreground">
            {tx("admin.whatsappToken.facts.notChecked")}
          </span>
        )}
      </dd>
      <dt className="text-muted-foreground">{tx("admin.whatsappToken.facts.token")}</dt>
      <dd className="min-w-0">
        {status.last4 ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-sm">
            <KeyRoundIcon className="size-3.5 text-muted-foreground" />
            <span aria-label={tx("admin.whatsappToken.facts.tokenEnding", { last4: status.last4 })}>
              •••• •••• {status.last4}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{tx("admin.whatsappToken.facts.noToken")}</span>
        )}
      </dd>
      <dt className="text-muted-foreground">{tx("admin.whatsappToken.facts.updated")}</dt>
      <dd className="min-w-0 break-words">
        {status.updatedAt ? (
          <>
            {formatDate(status.updatedAt, DATE_TIME_PATTERN)}
            <span className="text-muted-foreground">
              {" · "}
              {tx("admin.whatsappToken.facts.updatedBy", {
                name: status.updatedBy?.name ?? "—",
              })}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
      <dt className="text-muted-foreground">{tx("admin.whatsappToken.facts.waiting")}</dt>
      <dd className="min-w-0">
        {held === null ? (
          <span className="text-muted-foreground">
            {tx("admin.whatsappToken.facts.waitingUnknown")}
          </span>
        ) : (
          <span className={cn(held > 0 && "font-medium text-destructive")}>
            {waitingLabel(tx, held)}
          </span>
        )}
      </dd>
    </dl>
  );
}

type SaveResult = { kind: "refused"; message: string } | { kind: "saved" } | null;

/** Password-style paste field + Save. The pasted value is never shown, kept or logged. */
function PasteTokenForm({
  status,
  onBusyChange,
}: {
  status: WhatsAppTokenSettings;
  onBusyChange: (busy: boolean) => void;
}) {
  const tx = useTranslate();
  const { updateTokenAsync, isUpdatingToken } = useWhatsAppToken();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<SaveResult>(null);

  async function handleSave() {
    const token = value.trim();
    if (!token || isUpdatingToken) return;
    setResult(null);
    onBusyChange(true);
    try {
      await updateTokenAsync({ token });
      setValue("");
      setResult({ kind: "saved" });
    } catch (error) {
      setResult({ kind: "refused", message: tokenRefusalMessage(tx, error) });
    } finally {
      onBusyChange(false);
    }
  }

  const held = status.heldCount ?? 0;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-token" className="text-xs text-muted-foreground">
          {tx("admin.whatsappToken.form.label")}
        </Label>
        <div className="flex flex-col gap-2">
          <Input
            id="wa-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={tx("admin.whatsappToken.form.placeholder")}
            value={value}
            disabled={isUpdatingToken}
            onChange={(event) => {
              setValue(event.target.value);
              if (result) setResult(null);
            }}
            className="min-w-0 flex-1 font-mono"
          />
          <Button
            type="submit"
            className={cn(brandButton, "shrink-0")}
            disabled={isUpdatingToken || !value.trim()}
          >
            {isUpdatingToken ? (
              <>
                <Spinner /> {tx("admin.whatsappToken.form.checking")}
              </>
            ) : (
              tx("admin.whatsappToken.form.save")
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{tx("admin.whatsappToken.form.hint")}</p>
      </div>
      {result?.kind === "refused" && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{tx("admin.whatsappToken.form.refusedTitle")}</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      {result?.kind === "saved" && (
        <Alert>
          <CheckCircle2Icon className="text-brand" />
          <AlertTitle>{tx("admin.whatsappToken.form.savedTitle")}</AlertTitle>
          <AlertDescription>
            {status.state === "ok"
              ? held > 0
                ? tx("admin.whatsappToken.form.savedWaiting", { count: held })
                : tx("admin.whatsappToken.form.saved")
              : tx("admin.whatsappToken.form.savedAppNotAnswering")}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

function sendBlockedReason(tx: Tx, status: WhatsAppTokenSettings): string | null {
  if (status.state === "invalid") return tx("admin.whatsappToken.send.blockedInvalid");
  if (status.state === "unknown") return tx("admin.whatsappToken.send.blockedUnknown");
  if (!status.heldCount) return tx("admin.whatsappToken.send.blockedNone");
  return null;
}

/** "Send waiting messages (N)": the disabled reason, a confirm step and the queued result. */
function SendWaiting({ status }: { status: WhatsAppTokenSettings }) {
  const tx = useTranslate();
  const { sendWaitingAsync, isSendingWaiting } = useWhatsAppToken();
  const [confirming, setConfirming] = useState(false);
  const [queued, setQueued] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const blocked = sendBlockedReason(tx, status);
  const count = status.heldCount ?? 0;

  async function handleSend() {
    setConfirming(false);
    setRefusal(null);
    setQueued(null);
    try {
      const response = await sendWaitingAsync();
      setQueued(response.data.queued);
    } catch (error) {
      setRefusal(tokenRefusalMessage(tx, error));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="w-full rounded-full"
        disabled={Boolean(blocked) || isSendingWaiting}
        onClick={() => setConfirming(true)}
      >
        {isSendingWaiting ? (
          <>
            <Spinner /> {tx("admin.whatsappToken.send.sending")}
          </>
        ) : (
          <>
            <SendIcon />
            {status.heldCount === null
              ? tx("admin.whatsappToken.send.button")
              : tx("admin.whatsappToken.send.buttonCount", { count })}
          </>
        )}
      </Button>
      {queued !== null ? (
        <p className="flex items-center gap-1.5 text-xs text-brand">
          <CheckCircle2Icon className="size-3.5" />
          {queued === 1
            ? tx("admin.whatsappToken.send.queuedOne")
            : tx("admin.whatsappToken.send.queuedOther", { count: queued })}
        </p>
      ) : refusal ? (
        <p className="text-xs text-destructive">{refusal}</p>
      ) : (
        blocked && !isSendingWaiting && <p className="text-xs text-muted-foreground">{blocked}</p>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {count === 1
                ? tx("admin.whatsappToken.send.confirmTitleOne")
                : tx("admin.whatsappToken.send.confirmTitleOther", { count })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx("admin.whatsappToken.send.confirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={brandButton}
              onClick={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              {count === 1
                ? tx("admin.whatsappToken.send.confirmSubmitOne")
                : tx("admin.whatsappToken.send.confirmSubmitOther", { count })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DialogBody({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const { status, isStatusLoading } = useWhatsAppToken();
  if (!status || isStatusLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-full" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  return (
    <>
      <PasteTokenForm status={status} onBusyChange={onBusyChange} />
      <Separator />
      <TokenFacts status={status} />
      <Separator />
      <SendWaiting status={status} />
    </>
  );
}

/**
 * The WhatsApp access token dialog (Spec J-0), opened in place from the Admin banner: paste a new
 * token, the current status, and send the messages held while it was not working.
 */
export function WhatsAppTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tx = useTranslate();
  // True while Meta checks a pasted token; the dialog cannot be closed then.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 rounded-2xl p-0 sm:max-w-md">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircleIcon className="size-4 text-muted-foreground" />
                {tx("admin.whatsappToken.dialog.title")}
              </DialogTitle>
              <DialogDescription>{tx("admin.whatsappToken.dialog.description")}</DialogDescription>
            </DialogHeader>
            {/* Mounted only while open, so a reopened dialog starts with an empty field. */}
            {open && <DialogBody onBusyChange={setBusy} />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
