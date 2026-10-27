"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { useBills } from "~/hooks/use-bills";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useLedger } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage } from "~/lib/refusal";
import { keepRupeeInputCharacters, parseRupeesToPaise } from "~/lib/rupee-input";

import { MAX_REASON_LENGTH, RefusalAlert, businessToday } from "./ledger-shared";

type OpeningSide = "pending" | "advance";

/** Opening balance add: once per Customer, today or a past date. No message is sent. */
export function OpeningBalanceDialog({
  open,
  onOpenChange,
  customerId,
  shopName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  shopName: string;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const today = businessToday();
  const [side, setSide] = useState<OpeningSide>("pending");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [openingDate, setOpeningDate] = useState(today);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { addOpeningBalanceAsync, isAddingOpeningBalance } = useLedger({ customerId });
  const amountPaise = parseRupeesToPaise(amount);
  const dateValid = openingDate !== "" && openingDate <= today;
  const valid = amountPaise !== null && reason.trim() !== "" && dateValid;

  function reset() {
    setSide("pending");
    setAmount("");
    setReason("");
    setOpeningDate(businessToday());
    setRefusal(null);
  }

  async function handleSubmit() {
    if (!valid || amountPaise === null) return;
    setRefusal(null);
    try {
      await addOpeningBalanceAsync({
        customerId,
        side,
        amountPaise,
        reason: reason.trim(),
        openingDate,
      });
      toast.success(tx("admin.ledger.opening.success"));
      reset();
      onOpenChange(false);
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tx("admin.ledger.opening.title")}</DialogTitle>
          <DialogDescription>
            {tx("admin.ledger.opening.description", { shopName })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <RadioGroup
            value={side}
            onValueChange={(value) => setSide(value as OpeningSide)}
            className="grid grid-cols-2 gap-2"
          >
            {(["pending", "advance"] as const).map((value) => (
              <Label
                key={value}
                className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-brand"
              >
                <RadioGroupItem value={value} className="mt-0.5" />
                <span>
                  <span className="block font-medium">{tx(`admin.ledger.opening.${value}`)}</span>
                  <span className="text-xs text-muted-foreground">
                    {tx(`admin.ledger.opening.${value}Hint`)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="opening-amount">{tx("admin.ledger.opening.amount")}</Label>
              <Input
                id="opening-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(keepRupeeInputCharacters(event.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="opening-date">{tx("admin.ledger.opening.date")}</Label>
              <Input
                id="opening-date"
                type="date"
                max={today}
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
                aria-invalid={!dateValid}
              />
              <p
                className={dateValid ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
              >
                {dateValid
                  ? tx("admin.ledger.opening.dateHint")
                  : tx("admin.ledger.refusals.opening_date_in_future")}
              </p>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-reason">{tx("admin.ledger.opening.reason")}</Label>
            <Textarea
              id="opening-reason"
              maxLength={MAX_REASON_LENGTH}
              placeholder={tx("admin.ledger.opening.reasonPlaceholder")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <p className="text-sm">
            {tx("admin.ledger.opening.preview", {
              side: tx(
                side === "pending" ? "admin.ledger.columns.debit" : "admin.ledger.columns.credit",
              ),
              amount: amountPaise === null ? "—" : formatPaise(amountPaise),
              date: dateValid ? formatDate(openingDate, "d MMM yyyy") : "—",
            })}
          </p>
          {refusal && <RefusalAlert message={refusal} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx("admin.ledger.close")}
          </Button>
          <Button disabled={!valid || isAddingOpeningBalance} onClick={handleSubmit}>
            {isAddingOpeningBalance && <Spinner />}
            {isAddingOpeningBalance
              ? tx("admin.ledger.opening.submitting")
              : tx("admin.ledger.opening.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Raise Note from the Add menu: pick one of this Customer's Bills, then open it with the Note sheet. */
export function PickBillForNoteDialog({
  open,
  onOpenChange,
  customerId,
  shopName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  shopName: string;
}) {
  const tx = useTranslate();
  const router = useRouter();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const [billId, setBillId] = useState("");
  const { billsPage, isBillsListLoading, isBillsListError, refetchBillsList } = useBills({
    listFilters: { customerId, hideCancelled: true, page: 1, pageSize: 100 },
    enabled: open,
  });

  // A pick never outlives the dialog, so it cannot carry over to another Customer.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setBillId("");
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tx("admin.ledger.pickBill.title")}</DialogTitle>
          <DialogDescription>
            {tx("admin.ledger.pickBill.description", { shopName })}
          </DialogDescription>
        </DialogHeader>
        {isBillsListError ? (
          <RefusalAlert
            title={tx("admin.ledger.pickBill.loadError")}
            message={tx("admin.ledger.loadError.body")}
          />
        ) : !isBillsListLoading && billsPage.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx("admin.ledger.pickBill.empty")}</p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="note-bill">{tx("admin.ledger.pickBill.label")}</Label>
            <Select value={billId} onValueChange={setBillId}>
              <SelectTrigger id="note-bill" className="w-full">
                <SelectValue
                  placeholder={
                    isBillsListLoading
                      ? tx("common.status.loading")
                      : tx("admin.ledger.pickBill.placeholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {billsPage.items.map((bill) => (
                  <SelectItem key={bill.id} value={bill.id}>
                    <span className="font-mono">{bill.number}</span> ·{" "}
                    {formatDate(bill.billDate, "d MMM yyyy")} · {formatPaise(bill.totalPaise)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {tx("admin.ledger.close")}
          </Button>
          {isBillsListError && (
            <Button variant="outline" onClick={() => refetchBillsList()}>
              {tx("common.actions.tryAgain")}
            </Button>
          )}
          <Button
            disabled={!billId}
            onClick={() => router.push(`/admin/ledger/bills/${billId}?action=note`)}
          >
            {tx("admin.ledger.pickBill.open")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
