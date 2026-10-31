"use client";

import { InfoIcon, LockIcon } from "lucide-react";
import { type ReactNode } from "react";

import { CustomerNameLink } from "~/components/admin/shared/name-links";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerBalance, PaymentMode, PaymentPaper, RefundPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage, refusalOf } from "~/lib/refusal";
import { isAmountTooLarge, keepRupeeInputCharacters, parseRupeesToPaise } from "~/lib/rupee-input";

import { LedgerBackHeader, MAX_REASON_LENGTH, PaperLoadFailed } from "./ledger-shared";

export const PAYMENT_MODES: PaymentMode[] = ["cash", "bank", "upi"];

export const MAX_REFERENCE_LENGTH = 128;

const DATE_TIME = "d MMM yyyy, h:mm a";

// --- Money helpers.

/** A signed Balance (Debit positive) as Pending, Advance or Settled. */
export function toBalance(balancePaise: number): LedgerBalance {
  return {
    balancePaise,
    state: balancePaise > 0 ? "pending" : balancePaise < 0 ? "advance" : "settled",
    amountPaise: Math.abs(balancePaise),
  };
}

/** Like parseRupeesToPaise, but "0" / "0.00" is ₹0 (Correct may take a Payment or Refund to ₹0). */
export function parseRupeesAllowZero(rawInput: string): number | null {
  if (/^0*(\.0{0,2})?$/.test(rawInput.trim()) && /0/.test(rawInput)) return 0;
  return parseRupeesToPaise(rawInput);
}

/** The field's error key, or null while it is empty or fine. */
export function amountErrorKey(rawInput: string, allowZero: boolean): string | null {
  const trimmed = rawInput.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return "admin.ledger.money.amountDecimals";
  if (isAmountTooLarge(trimmed)) return "common.validation.amountTooLarge";
  const paise = allowZero ? parseRupeesAllowZero(trimmed) : parseRupeesToPaise(trimmed);
  if (paise == null) return "admin.ledger.money.amountAboveZero";
  return null;
}

/**
 * Copy for a refused Payment or Refund write: the money wording under `admin.ledger.money.refusals`
 * (with the current Advance where the server sent it), else the Ledger's refusal copy.
 */
export function moneyRefusalMessage(
  tx: (key: string, values?: Record<string, string | number>) => string,
  formatPaise: (paise: number) => string,
  error: unknown,
): string {
  const refusal = refusalOf(error);
  if (refusal) {
    const details = refusal.details ?? {};
    const advance = typeof details.advancePaise === "number" ? details.advancePaise : null;
    const increase = typeof details.increasePaise === "number" ? details.increasePaise : null;
    const reason =
      refusal.reason === "refund_above_advance" && increase != null
        ? "refund_raise_above_advance"
        : refusal.reason;
    const key = `admin.ledger.money.refusals.${reason}`;
    const message = tx(key, {
      advance: advance == null ? "—" : formatPaise(advance),
      increase: increase == null ? "—" : formatPaise(increase),
    });
    if (message !== key) return message;
  }
  return refusalMessage(tx, error, tx("admin.ledger.refusals.generic"));
}

// --- Form fields.

export function ModeField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: PaymentMode;
  onChange: (mode: PaymentMode) => void;
  disabled?: boolean;
}) {
  const tx = useTranslate();
  return (
    <div className="grid gap-1.5">
      <Label id={`${id}-label`}>{tx("admin.ledger.money.mode")}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-labelledby={`${id}-label`}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next && onChange(next as PaymentMode)}
        className="w-full"
      >
        {PAYMENT_MODES.map((mode) => (
          <ToggleGroupItem
            key={mode}
            id={`${id}-${mode}`}
            value={mode}
            className="flex-1 px-4 data-[state=on]:bg-accent data-[state=on]:text-brand"
          >
            {tx(`admin.ledger.money.modes.${mode}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function AmountField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  action,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  action?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(keepRupeeInputCharacters(event.target.value))}
        className="rounded-xl bg-muted/40"
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function ReferenceField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const tx = useTranslate();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {tx("admin.ledger.money.reference")}{" "}
        <span className="font-normal text-muted-foreground">
          {tx("admin.ledger.money.optional")}
        </span>
      </Label>
      <Input
        id={id}
        maxLength={MAX_REFERENCE_LENGTH}
        disabled={disabled}
        placeholder={tx("admin.ledger.money.referencePlaceholder")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl bg-muted/40"
      />
    </div>
  );
}

export function MoneyReasonField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const tx = useTranslate();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{tx("admin.ledger.money.reasonLabel")}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_REASON_LENGTH}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl bg-muted/40"
      />
    </div>
  );
}

export function PreviewLine({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-muted px-3 py-2 text-sm">{children}</div>;
}

// --- Paper pieces.

export function Fact({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : "min-w-0"}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export function InactiveNotice() {
  const tx = useTranslate();
  return (
    <Alert>
      <LockIcon />
      <AlertTitle>{tx("admin.ledger.money.paper.inactiveTitle")}</AlertTitle>
      <AlertDescription>{tx("admin.ledger.money.paper.inactiveBody")}</AlertDescription>
    </Alert>
  );
}

export function PaymentFacts({ paper }: { paper: PaymentPaper }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { payment, customer } = paper;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Fact label={tx("admin.ledger.money.paper.customer")}>
        <CustomerNameLink customerId={customer.id}>{customer.shopName}</CustomerNameLink>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.route")}>
        {customer.routeName} ({customer.routeCode})
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.posted")}>
        {formatDate(payment.postedAt, DATE_TIME)}
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.mode")}>
        {tx(`admin.ledger.money.modes.${payment.mode}`)}
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.keptLabel")}>
        <span className="font-semibold tabular-nums">{formatPaise(payment.keptPaise)}</span>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.receivedReturned")}>
        <span className="tabular-nums">
          {formatPaise(payment.receivedPaise)} / {formatPaise(payment.returnedPaise)}
        </span>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.reference")}>{payment.reference ?? "—"}</Fact>
      <Fact label={tx("admin.ledger.money.paper.recordedBy")}>
        {payment.actorName ?? "—"}
        <span className="block text-xs text-muted-foreground">
          {payment.source === "gatepass" && payment.gatepass
            ? tx("admin.ledger.money.paper.fromGatepass", {
                date: formatDate(payment.gatepass.businessDate, "d MMM yyyy"),
              })
            : tx("admin.ledger.money.paper.atOffice")}
        </span>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.reason")}>
        {payment.reason ?? (
          <span className="text-muted-foreground">{tx("admin.ledger.money.paper.noReason")}</span>
        )}
      </Fact>
    </dl>
  );
}

export function RefundFacts({ paper }: { paper: RefundPaper }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { refund, customer } = paper;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Fact label={tx("admin.ledger.money.paper.customer")}>
        <CustomerNameLink customerId={customer.id}>{customer.shopName}</CustomerNameLink>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.route")}>
        {customer.routeName} ({customer.routeCode})
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.posted")}>
        {formatDate(refund.postedAt, DATE_TIME)}
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.mode")}>
        {tx(`admin.ledger.money.modes.${refund.mode}`)}
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.amountPaidBack")}>
        <span className="font-semibold tabular-nums">{formatPaise(refund.amountPaise)}</span>
      </Fact>
      <Fact label={tx("admin.ledger.money.paper.reference")}>{refund.reference ?? "—"}</Fact>
      <Fact label={tx("admin.ledger.money.paper.recordedBy")}>{refund.actorName ?? "—"}</Fact>
      <Fact label={tx("admin.ledger.money.paper.reason")} wide>
        {refund.reason}
      </Fact>
    </dl>
  );
}

export interface HistoryEvent {
  id: string;
  kind: "posted" | "adjusted";
  occurredAt: Date | string;
  afterPaise: number;
  previousPaise: number;
  differencePaise: number;
  mode: PaymentMode;
  reference: string | null;
  reason: string | null;
  actorName: string | null;
  ledgerEntryId: string | null;
}

export function paymentHistory(paper: PaymentPaper): HistoryEvent[] {
  return paper.events.map((event) => ({
    ...event,
    afterPaise: event.keptPaise,
    previousPaise: event.previousKeptPaise,
  }));
}

export function refundHistory(paper: RefundPaper): HistoryEvent[] {
  return paper.events.map((event) => ({
    ...event,
    afterPaise: event.amountPaise,
    previousPaise: event.previousAmountPaise,
  }));
}

function ledgerEffectKey(event: HistoryEvent) {
  if (event.kind === "posted") return "admin.ledger.money.history.posted";
  if (!event.ledgerEntryId) return "admin.ledger.money.history.noLedgerRow";
  return "admin.ledger.money.history.adjustedRow";
}

function useSignedPaise() {
  const { formatPaise } = useFormatMoney();
  return (paise: number) =>
    paise > 0 ? `+ ${formatPaise(paise)}` : paise < 0 ? `− ${formatPaise(-paise)}` : formatPaise(0);
}

/** Every posted and adjusted event, newest first. A posted event shows no "previous". */
export function HistoryList({
  events,
  afterLabel,
}: {
  events: HistoryEvent[];
  afterLabel: string;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const signedPaise = useSignedPaise();
  const newestFirst = [...events].reverse();
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("admin.ledger.money.history.when")}</TableHead>
              <TableHead className="text-right">{afterLabel}</TableHead>
              <TableHead className="text-right">
                {tx("admin.ledger.money.history.previous")}
              </TableHead>
              <TableHead className="text-right">
                {tx("admin.ledger.money.history.difference")}
              </TableHead>
              <TableHead>{tx("admin.ledger.money.history.modeRef")}</TableHead>
              <TableHead>{tx("admin.ledger.money.history.reason")}</TableHead>
              <TableHead>{tx("admin.ledger.money.history.by")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newestFirst.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(event.occurredAt, DATE_TIME)}
                  <span className="block text-xs text-muted-foreground">
                    {tx(ledgerEffectKey(event))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPaise(event.afterPaise)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {event.kind === "posted" ? "" : formatPaise(event.previousPaise)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {event.kind === "posted" ? "" : signedPaise(event.differencePaise)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {tx(`admin.ledger.money.modes.${event.mode}`)}
                  {event.reference && (
                    <span className="block text-xs text-muted-foreground">{event.reference}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[14rem] whitespace-normal">
                  {event.reason ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{event.actorName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ol className="flex flex-col gap-2 md:hidden">
        {newestFirst.map((event) => (
          <li key={event.id} className="space-y-1 rounded-2xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {event.kind === "posted"
                    ? tx("admin.ledger.money.history.posted")
                    : tx("admin.ledger.money.history.corrected")}
                  <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                    {tx(ledgerEffectKey(event))}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(event.occurredAt, DATE_TIME)} · {event.actorName ?? "—"}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm tabular-nums">
                {formatPaise(event.afterPaise)}
                {event.kind === "adjusted" && event.differencePaise !== 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {tx("admin.ledger.money.history.was", {
                      amount: formatPaise(event.previousPaise),
                      difference: signedPaise(event.differencePaise),
                    })}
                  </span>
                )}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {tx(`admin.ledger.money.modes.${event.mode}`)}
              {event.reference && ` · ${event.reference}`}
            </p>
            {event.reason && <p className="text-sm break-words">{event.reason}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}

export function PaperSkeleton() {
  return <DetailPageSkeleton />;
}

export function PaperLoadError({
  title,
  customerId,
  onRetry,
}: {
  title: string;
  customerId?: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
      <LedgerBackHeader customerId={customerId} />
      <PaperLoadFailed message={title} onRetry={onRetry} />
    </div>
  );
}

export function RefundNotInAdvance({ balance }: { balance: LedgerBalance }) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  return (
    <Alert>
      <InfoIcon />
      <AlertTitle>{tx("admin.ledger.money.addRefund.noAdvanceTitle")}</AlertTitle>
      <AlertDescription>
        {balance.state === "pending"
          ? tx("admin.ledger.money.addRefund.noAdvancePending", {
              amount: formatPaise(balance.amountPaise),
            })
          : tx("admin.ledger.money.addRefund.noAdvanceSettled")}
      </AlertDescription>
    </Alert>
  );
}
