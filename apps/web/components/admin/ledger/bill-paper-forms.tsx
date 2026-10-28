"use client";

import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "~/components/shared/date-picker";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Spinner } from "~/components/ui/spinner";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useBillPaper, useLedgerPreviews, type BillPaper, type NoteKind } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { isOutcomeUnknown, refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

import type { BuyerText, CorrectEdit } from "./bill-paper-document";
import {
  NOTE_KINDS,
  OutcomeUnknownAlert,
  ReasonField,
  RefusalAlert,
  businessToday,
  useBalanceText,
} from "./ledger-shared";

const PREVIEW_DEBOUNCE_MS = 350;

// A preview input settles before it is sent; compared by value, so a re-render with the same
// input never restarts the wait or the query.
export function useDebouncedPreviewInput<Input>(input: Input | null): Input | null {
  const debouncedKey = useDebouncedValue(JSON.stringify(input), PREVIEW_DEBOUNCE_MS);
  return useMemo(() => JSON.parse(debouncedKey) as Input | null, [debouncedKey]);
}

// --- Correct in place.

export function useCorrectState(paper: BillPaper) {
  const issuedBuyer: BuyerText = {
    shopName: paper.version.letterhead.buyer.shop_name,
    phone: paper.version.letterhead.buyer.phone,
    address: paper.version.letterhead.buyer.address,
  };
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(paper.lines.map((line) => [line.id, line.quantity])),
  );
  const [buyer, setBuyer] = useState<BuyerText>(issuedBuyer);

  const changedLines = paper.lines
    .filter((line) => (quantities[line.id] ?? line.quantity) !== line.quantity)
    .map((line) => ({ lineId: line.id, quantity: quantities[line.id] ?? line.quantity }));
  const trimmedBuyer = {
    shopName: buyer.shopName.trim(),
    phone: buyer.phone.trim(),
    address: buyer.address.trim(),
  };
  const buyerChanged =
    trimmedBuyer.shopName !== issuedBuyer.shopName ||
    trimmedBuyer.phone !== issuedBuyer.phone ||
    trimmedBuyer.address !== issuedBuyer.address;
  const buyerFilled =
    trimmedBuyer.shopName !== "" && trimmedBuyer.phone !== "" && trimmedBuyer.address !== "";

  return {
    quantities,
    setQuantity: (lineId: string, quantity: number) =>
      setQuantities((current) => ({ ...current, [lineId]: quantity })),
    buyer,
    setBuyer,
    changedLines,
    buyerChanged,
    buyerFilled,
    trimmedBuyer,
    hasChanges: changedLines.length > 0 || buyerChanged,
  };
}

export type CorrectState = ReturnType<typeof useCorrectState>;

/** The server's word on the edit, for the paper's live totals. */
export function useCorrectPreview(paper: BillPaper, state: CorrectState) {
  const previewInput =
    state.hasChanges && state.buyerFilled
      ? {
          billId: paper.bill.id,
          expectedVersionNumber: paper.bill.latestVersionNumber,
          lines: state.changedLines,
          buyer: state.buyerChanged ? state.trimmedBuyer : undefined,
        }
      : null;
  const debouncedInput = useDebouncedPreviewInput(previewInput);
  return useLedgerPreviews({ correct: debouncedInput });
}

export function toCorrectEdit(
  state: CorrectState,
  preview: ReturnType<typeof useCorrectPreview>,
  disabled: boolean,
): CorrectEdit {
  return {
    disabled,
    quantities: state.quantities,
    setQuantity: state.setQuantity,
    buyer: state.buyer,
    totals: preview.correctPreview?.totals ?? null,
  };
}

export function BuyerFields({ state, disabled }: { state: CorrectState; disabled?: boolean }) {
  const tx = useTranslate();
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label htmlFor="buyer-shop">{tx("admin.ledger.paper.buyer.shopName")}</Label>
        <Input
          id="buyer-shop"
          maxLength={200}
          disabled={disabled}
          value={state.buyer.shopName}
          onChange={(event) => state.setBuyer({ ...state.buyer, shopName: event.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="buyer-phone">{tx("admin.ledger.paper.buyer.phone")}</Label>
        <Input
          id="buyer-phone"
          inputMode="tel"
          maxLength={20}
          disabled={disabled}
          value={state.buyer.phone}
          onChange={(event) => state.setBuyer({ ...state.buyer, phone: event.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="buyer-address">{tx("admin.ledger.paper.buyer.address")}</Label>
        <Input
          id="buyer-address"
          disabled={disabled}
          value={state.buyer.address}
          onChange={(event) => state.setBuyer({ ...state.buyer, address: event.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{tx("admin.ledger.paper.buyer.gstinHint")}</p>
    </div>
  );
}

export function CorrectPanel({
  paper,
  state,
  preview,
  correct,
  onClose,
  onSaved,
}: {
  paper: BillPaper;
  state: CorrectState;
  preview: ReturnType<typeof useCorrectPreview>;
  // From the page, which also greys out the paper's steppers while the save runs.
  correct: Pick<ReturnType<typeof useBillPaper>, "correctBillAsync" | "isCorrectingBill">;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isBuyerOpen, setIsBuyerOpen] = useState(false);
  const { correctBillAsync, isCorrectingBill } = correct;
  const { correctPreview, correctPreviewError, isCorrectPreviewFetching } = preview;
  const canSave =
    state.hasChanges &&
    state.buyerFilled &&
    reason.trim() !== "" &&
    correctPreviewError == null &&
    !isCorrectingBill;

  async function handleSave() {
    if (!canSave) return;
    setRefusal(null);
    try {
      const result = await correctBillAsync({
        billId: paper.bill.id,
        expectedVersionNumber: paper.bill.latestVersionNumber,
        lines: state.changedLines,
        buyer: state.buyerChanged ? state.trimmedBuyer : undefined,
        reason: reason.trim(),
      });
      toast.success(tx("admin.ledger.paper.correctSaved", { version: result.data.versionNumber }));
      onSaved();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
        {!state.hasChanges ? (
          <p className="text-muted-foreground">{tx("admin.ledger.paper.preview.nothingYet")}</p>
        ) : !state.buyerFilled ? (
          <p className="text-destructive">{tx("admin.ledger.paper.buyer.required")}</p>
        ) : correctPreviewError ? (
          <p className="text-destructive">
            {refusalMessage(tx, correctPreviewError, tx("admin.ledger.refusals.generic"))}
          </p>
        ) : !correctPreview ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> {tx("admin.ledger.paper.preview.checking")}
          </p>
        ) : (
          <>
            <p className="font-medium">
              {tx(`admin.ledger.paper.preview.${correctPreview.classification}`)}
            </p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5">
              {correctPreview.creditNote && (
                <>
                  <dt className="text-muted-foreground">
                    {tx(`admin.ledger.rowTypes.${correctPreview.creditNote.kind}`)}
                  </dt>
                  <dd className="text-right tabular-nums text-brand">
                    − {formatPaise(correctPreview.creditNote.amountPaise)}
                  </dd>
                </>
              )}
              {correctPreview.debitNote && (
                <>
                  <dt className="text-muted-foreground">
                    {tx("admin.ledger.rowTypes.debit_note")}
                  </dt>
                  <dd className="text-right tabular-nums">
                    + {formatPaise(correctPreview.debitNote.amountPaise)}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {tx("admin.ledger.paper.preview.billTotal")}
              </dt>
              <dd className="text-right tabular-nums">
                {formatPaise(paper.version.totals.totalPaise)} →{" "}
                {formatPaise(correctPreview.totals.totalPaise)}
              </dd>
            </dl>
            {correctPreview.billHasNotes && correctPreview.classification !== "text_only" && (
              <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                {tx("admin.ledger.paper.preview.notesWarning")}
              </p>
            )}
            {isCorrectPreviewFetching && (
              <p className="text-xs text-muted-foreground">
                {tx("admin.ledger.paper.preview.checking")}
              </p>
            )}
          </>
        )}
      </div>
      <Collapsible
        open={isBuyerOpen || !state.buyerFilled}
        onOpenChange={setIsBuyerOpen}
        className="rounded-xl border px-3 py-2"
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm">
          {tx("admin.ledger.paper.buyerText")}
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform",
              (isBuyerOpen || !state.buyerFilled) && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <BuyerFields state={state} disabled={isCorrectingBill} />
        </CollapsibleContent>
      </Collapsible>
      <ReasonField
        id="correct-reason"
        value={reason}
        onChange={setReason}
        disabled={isCorrectingBill}
        placeholder={tx("admin.ledger.paper.correctReasonPlaceholder")}
      />
      {refusal && <RefusalAlert message={refusal} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end lg:flex-col-reverse">
        <Button
          variant="outline"
          className="rounded-full"
          disabled={isCorrectingBill}
          onClick={onClose}
        >
          {tx("common.actions.cancel")}
        </Button>
        <Button
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isCorrectingBill && <Spinner />}
          {isCorrectingBill ? tx("admin.ledger.saving") : tx("admin.ledger.paper.saveCorrect")}
        </Button>
      </div>
    </div>
  );
}

// --- Cancel.

export function CancelForm({ paper, onDone }: { paper: BillPaper; onDone: () => void }) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const balanceText = useBalanceText();
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const { cancelBillAsync, isCancellingBill } = useBillPaper();

  async function handleCancel() {
    if (reason.trim() === "" || isCancellingBill) return;
    setRefusal(null);
    try {
      const result = await cancelBillAsync({
        billId: paper.bill.id,
        expectedVersionNumber: paper.bill.latestVersionNumber,
        reason: reason.trim(),
      });
      toast.success(
        tx("admin.ledger.paper.cancel.done", {
          kind: tx(`admin.ledger.rowTypes.${result.data.creditNote.kind}`),
          number: result.data.creditNote.number,
          amount: formatPaise(result.data.creditNote.amountPaise),
        }),
      );
      onDone();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1 rounded-xl border bg-muted/40 p-3">
        <p>{tx("admin.ledger.paper.cancel.body")}</p>
        {paper.balance && (
          <p className="text-muted-foreground">
            {tx("admin.ledger.paper.balanceNow", { balance: balanceText(paper.balance) })}
          </p>
        )}
        <p className="text-muted-foreground">
          {paper.bill.orderId
            ? tx("admin.ledger.paper.cancel.stock")
            : tx("admin.ledger.paper.cancel.officeStock")}
        </p>
      </div>
      <ReasonField
        id="cancel-reason"
        value={reason}
        onChange={setReason}
        disabled={isCancellingBill}
        placeholder={tx("admin.ledger.paper.cancel.placeholder")}
      />
      {refusal && <RefusalAlert message={refusal} />}
      <Button
        variant="destructive"
        className="w-full rounded-full"
        disabled={reason.trim() === "" || isCancellingBill}
        onClick={handleCancel}
      >
        {isCancellingBill && <Spinner />}
        {isCancellingBill ? tx("admin.ledger.saving") : tx("admin.ledger.paper.cancel.submit")}
      </Button>
    </div>
  );
}

// --- Raise Note.

export function RaiseNoteForm({
  paper,
  idempotencyKey,
  onRaised,
  onDone,
}: {
  paper: BillPaper;
  // One key per Note on this paper, kept by the page across sheet closes; rotated on success only,
  // so a retry after a lost answer (even with a reworded reason) can never raise a second Note.
  idempotencyKey: string;
  onRaised: () => void;
  onDone: () => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const today = businessToday();
  const [kind, setKind] = useState<NoteKind>("gst_credit_note");
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [returnedOn, setReturnedOn] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const { raiseNoteAsync, isRaisingNote } = useBillPaper();
  const isCredit = kind !== "debit_note";
  const lines = paper.lines
    .filter((line) => (picks[line.id] ?? 0) > 0)
    .map((line) => ({ lineId: line.id, quantity: picks[line.id]! }));
  const over = isCredit && paper.lines.some((line) => (picks[line.id] ?? 0) > line.remainingQty);

  const previewInput =
    lines.length > 0 && !over
      ? {
          billId: paper.bill.id,
          expectedVersionNumber: paper.bill.latestVersionNumber,
          kind,
          lines,
        }
      : null;
  const debouncedNoteInput = useDebouncedPreviewInput(previewInput);
  const { raiseNotePreview, raiseNotePreviewError } = useLedgerPreviews({
    raiseNote: debouncedNoteInput,
  });
  // A preview for the kind just left would show the wrong sign and amount, so it is hidden.
  const previewForKind = previewInput !== null && debouncedNoteInput?.kind === kind;

  const canSubmit =
    lines.length > 0 &&
    !over &&
    reason.trim() !== "" &&
    raiseNotePreviewError == null &&
    !isRaisingNote;

  async function handleSubmit() {
    if (!canSubmit) return;
    setRefusal(null);
    setOutcomeUnknown(false);
    try {
      const result = await raiseNoteAsync({
        billId: paper.bill.id,
        expectedVersionNumber: paper.bill.latestVersionNumber,
        kind,
        lines,
        reason: reason.trim(),
        returnOrDamageOn: isCredit && returnedOn ? returnedOn : undefined,
        idempotencyKey,
      });
      onRaised();
      toast.success(
        tx("admin.ledger.paper.note.done", {
          kind: tx(`admin.ledger.rowTypes.${result.data.kind}`),
          number: result.data.number,
          amount: formatPaise(result.data.amountPaise),
        }),
      );
      onDone();
    } catch (error) {
      if (isOutcomeUnknown(error)) setOutcomeUnknown(true);
      else setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <RadioGroup
        value={kind}
        onValueChange={(value) => setKind(value as NoteKind)}
        className="grid gap-2"
      >
        {NOTE_KINDS.map((value) => (
          <Label
            key={value}
            className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 font-normal has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-accent/50"
          >
            <RadioGroupItem value={value} className="mt-0.5" disabled={isRaisingNote} />
            <span>{tx(`admin.ledger.rowTypes.${value}`)}</span>
          </Label>
        ))}
      </RadioGroup>
      <ul className="divide-y rounded-xl border">
        {paper.lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate">{line.name}</span>
              <span
                className={cn(
                  "block text-xs text-muted-foreground",
                  isCredit && (picks[line.id] ?? 0) > line.remainingQty && "text-destructive",
                )}
              >
                {isCredit
                  ? tx("admin.ledger.paper.note.leftToCredit", { count: line.remainingQty })
                  : tx("admin.ledger.paper.note.onBill", { count: line.quantity })}
              </span>
            </span>
            <QuantityStepper
              quantity={picks[line.id] ?? 0}
              minQuantity={0}
              disabled={isRaisingNote}
              onQuantityChange={(quantity) =>
                setPicks((current) => ({ ...current, [line.id]: quantity }))
              }
            />
          </li>
        ))}
      </ul>
      {over && (
        <p className="text-destructive">{tx("admin.ledger.refusals.credit_qty_above_remaining")}</p>
      )}
      {isCredit && (
        <div className="grid gap-1.5">
          <Label htmlFor="returned-on">{tx("admin.ledger.paper.note.returnedOn")}</Label>
          <DatePicker
            id="returned-on"
            max={today}
            value={returnedOn}
            disabled={isRaisingNote}
            clearable
            onChange={setReturnedOn}
          />
        </div>
      )}
      {raiseNotePreviewError ? (
        <p className="text-destructive">
          {refusalMessage(tx, raiseNotePreviewError, tx("admin.ledger.refusals.generic"))}
        </p>
      ) : (
        raiseNotePreview &&
        previewForKind && (
          <div className="space-y-2">
            <p>
              {tx("admin.ledger.paper.note.amount", {
                kind: tx(`admin.ledger.rowTypes.${raiseNotePreview.note.kind}`),
                amount: `${isCredit ? "−" : "+"} ${formatPaise(raiseNotePreview.note.amountPaise)}`,
              })}
              {kind === "commercial_credit_note" && (
                <span className="text-muted-foreground">
                  {" "}
                  {tx("admin.ledger.paper.note.noTax")}
                </span>
              )}
            </p>
            {raiseNotePreview.billHasNotes && (
              <p className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                {tx("admin.ledger.paper.preview.notesWarning")}
              </p>
            )}
          </div>
        )
      )}
      <p className="text-xs text-muted-foreground">{tx("admin.ledger.paper.note.neverChanges")}</p>
      <ReasonField
        id="note-reason"
        value={reason}
        onChange={setReason}
        disabled={isRaisingNote}
        placeholder={tx("admin.ledger.paper.note.placeholder")}
      />
      {outcomeUnknown && <OutcomeUnknownAlert message={tx("admin.ledger.outcomeUnknown.note")} />}
      {refusal && <RefusalAlert message={refusal} />}
      <Button
        className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {isRaisingNote && <Spinner />}
        {isRaisingNote
          ? tx("admin.ledger.saving")
          : tx("admin.ledger.paper.note.submit", { kind: tx(`admin.ledger.rowTypes.${kind}`) })}
      </Button>
    </div>
  );
}
