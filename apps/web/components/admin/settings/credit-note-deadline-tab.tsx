"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "~/components/shared/date-picker";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useFormatDate } from "~/hooks/use-format-date";
import { useSettings } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";

import { SettingsHistoryToggle } from "./settings-history";

type CreditNoteDeadlineEntry =
  RouterOutputs["settings"]["creditNoteDeadline"]["list"]["data"][number];

// "26-27" ends on 31 March 2027; read as 20YY like the server.
function endYearOf(financialYear: string): number {
  return 2000 + Number(financialYear.slice(0, 2)) + 1;
}

function lastDayOf(financialYear: string): string {
  return `${endYearOf(financialYear)}-03-31`;
}

// The server's default when the Admin has not set a date: 30 November after the year ends.
function defaultDeadlineOf(financialYear: string): string {
  return `${endYearOf(financialYear)}-11-30`;
}

export function CreditNoteDeadlineTab({ deadlines }: { deadlines: CreditNoteDeadlineEntry[] }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const [editingYear, setEditingYear] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{tx("admin.settings.deadline.intro")}</p>
      {deadlines.map((entry) => (
        <div key={entry.financialYear} className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {tx("admin.settings.deadline.billsOf", { year: entry.financialYear })}
              </p>
              <p className="text-sm">
                {formatDate(`${entry.deadlineDate}T00:00:00`, "d MMM yyyy")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {entry.source === "default" ? (
                <Badge variant="outline">{tx("admin.settings.deadline.default")}</Badge>
              ) : (
                <Badge variant="secondary">{tx("admin.settings.deadline.setByAdmin")}</Badge>
              )}
              {editingYear !== entry.financialYear && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setEditingYear(entry.financialYear)}
                >
                  {entry.source === "default"
                    ? tx("admin.settings.deadline.set")
                    : tx("common.actions.change")}
                </Button>
              )}
            </div>
          </div>
          {editingYear === entry.financialYear && (
            <div className="mt-3 border-t pt-3">
              <DeadlineEditor entry={entry} onDone={() => setEditingYear(null)} />
            </div>
          )}
          {entry.source === "configured" && (
            <div className="mt-2">
              <SettingsHistoryToggle
                subject={{ kind: "creditNoteDeadline", financialYear: entry.financialYear }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DeadlineEditor({ entry, onDone }: { entry: CreditNoteDeadlineEntry; onDone: () => void }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { setCreditNoteDeadlineAsync, isSettingCreditNoteDeadline } = useSettings({
    enabled: false,
  });
  const [date, setDate] = useState(entry.deadlineDate);
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);

  const lastDay = lastDayOf(entry.financialYear);
  const defaultDate = defaultDeadlineOf(entry.financialYear);
  const isDateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > lastDay;
  const inputId = `deadline-${entry.financialYear}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDateValid) {
      setShowError(true);
      return;
    }
    try {
      await setCreditNoteDeadlineAsync({
        financialYear: entry.financialYear,
        date,
        reason: reason.trim() || undefined,
      });
      toast.success(tx("admin.settings.deadline.saveSuccess"));
      onDone();
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.deadline.saveFailed")));
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>
          {tx("admin.settings.deadline.label", { year: entry.financialYear })}
        </Label>
        <DatePicker
          id={inputId}
          value={date}
          onChange={(value) => {
            setDate(value);
            setShowError(false);
          }}
        />
      </div>
      {showError && !isDateValid && (
        <p className="text-xs text-destructive">
          {tx("admin.settings.deadline.invalid", {
            date: formatDate(`${lastDay}T00:00:00`, "d MMM yyyy"),
          })}
        </p>
      )}
      <Button
        type="button"
        variant="link"
        className="h-auto self-start p-0 text-xs text-brand"
        onClick={() => {
          setDate(defaultDate);
          setShowError(false);
        }}
      >
        {tx("admin.settings.deadline.useDefault", {
          date: formatDate(`${defaultDate}T00:00:00`, "d MMM yyyy"),
        })}
      </Button>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${inputId}-reason`}>{tx("admin.settings.reasonLabel")}</Label>
        <Input
          id={`${inputId}-reason`}
          placeholder={tx("admin.settings.reasonPlaceholder")}
          maxLength={500}
          value={reason}
          className="rounded-xl bg-muted/40"
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSettingCreditNoteDeadline}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isSettingCreditNoteDeadline
            ? tx("common.status.pleaseWait")
            : tx("admin.settings.deadline.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={onDone}>
          {tx("common.actions.cancel")}
        </Button>
      </div>
    </form>
  );
}
