"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { Loader2Icon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useSettings } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";

import { SettingsHistoryToggle } from "./settings-history";

type NumberSeriesEntry = RouterOutputs["settings"]["numberSeries"]["list"]["data"][number];

const PREFIX_PATTERN = /^[A-Z]{1,2}$/;

interface NumberSeriesTabProps {
  // Newest first: next year, current year, then earlier years.
  financialYears: string[];
  currentFinancialYear: string;
  nextFinancialYear: string;
}

export function NumberSeriesTab({
  financialYears,
  currentFinancialYear,
  nextFinancialYear,
}: NumberSeriesTabProps) {
  const tx = useTranslate();
  const [financialYear, setFinancialYear] = useState(currentFinancialYear);
  const [editingKind, setEditingKind] = useState<string | null>(null);
  const {
    numberSeries,
    isNumberSeriesLoading,
    isNumberSeriesError,
    refetchNumberSeries,
    prepareYearAsync,
    isPreparingYear,
  } = useSettings({ financialYear });

  const isNextYear = financialYear === nextFinancialYear;
  const missingCount = numberSeries.filter((entry) => !entry.saved).length;

  async function handlePrepareYear() {
    try {
      await prepareYearAsync({ financialYear: nextFinancialYear });
      toast.success(tx("admin.settings.prefixes.prepareSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.settings.prefixes.prepareFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {financialYears.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => {
              setFinancialYear(year);
              setEditingKind(null);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
              financialYear === year
                ? "border-transparent bg-brand text-brand-foreground"
                : "bg-card hover:bg-accent",
            )}
          >
            {tx("admin.settings.prefixes.financialYear", { year })}
            {year === currentFinancialYear && (
              <span className="ml-1 text-[10px] opacity-70">
                {tx("admin.settings.prefixes.now")}
              </span>
            )}
            {year === nextFinancialYear && (
              <span className="ml-1 text-[10px] opacity-70">
                {tx("admin.settings.prefixes.next")}
              </span>
            )}
          </button>
        ))}
      </div>

      {isNextYear && !isNumberSeriesLoading && !isNumberSeriesError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">
            {missingCount > 0
              ? tx("admin.settings.prefixes.missing", { count: missingCount })
              : tx("admin.settings.prefixes.allExist")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={missingCount === 0 || isPreparingYear}
            onClick={() => void handlePrepareYear()}
          >
            {isPreparingYear ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {tx("admin.settings.prefixes.prepare")}
          </Button>
        </div>
      )}

      {isNumberSeriesLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : isNumberSeriesError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{tx("admin.settings.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchNumberSeries()}>
            {tx("common.actions.tryAgain")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {numberSeries.map((entry) => (
            <li key={entry.kind} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">
                    {tx(`admin.settings.prefixes.kinds.${entry.kind}`)}
                  </p>
                  <p className="font-mono text-lg">{entry.prefix}</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {tx("admin.settings.prefixes.nextNumber", { number: entry.nextNumberPreview })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <SeriesStatus entry={entry} isNextYear={isNextYear} />
                  {entry.editable && editingKind !== entry.kind && (
                    <Button size="sm" variant="ghost" onClick={() => setEditingKind(entry.kind)}>
                      {tx("common.actions.change")}
                    </Button>
                  )}
                </div>
              </div>
              {editingKind === entry.kind && (
                <div className="mt-3 border-t pt-3">
                  <PrefixEditor
                    financialYear={financialYear}
                    entry={entry}
                    onDone={() => setEditingKind(null)}
                  />
                </div>
              )}
              {entry.id && (
                <div className="mt-2">
                  <SettingsHistoryToggle subject={{ kind: "numberSeries", seriesId: entry.id }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">{tx("admin.settings.prefixes.sharedNote")}</p>
    </div>
  );
}

function SeriesStatus({ entry, isNextYear }: { entry: NumberSeriesEntry; isNextYear: boolean }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  if (entry.firstUsedAt) {
    return (
      <Badge variant="secondary">
        <LockIcon />
        {tx("admin.settings.prefixes.frozenSince", {
          date: formatDate(entry.firstUsedAt, "d MMM yyyy"),
        })}
      </Badge>
    );
  }
  if (!entry.editable) {
    return <Badge variant="outline">{tx("admin.settings.prefixes.readOnly")}</Badge>;
  }
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {!entry.saved && <Badge variant="outline">{tx("admin.settings.prefixes.default")}</Badge>}
      <Badge variant="outline" className="border-emerald-500/50 text-emerald-700">
        {isNextYear
          ? tx("admin.settings.prefixes.editableNextYear")
          : tx("admin.settings.prefixes.editable")}
      </Badge>
    </span>
  );
}

interface PrefixEditorProps {
  financialYear: string;
  entry: NumberSeriesEntry;
  onDone: () => void;
}

function PrefixEditor({ financialYear, entry, onDone }: PrefixEditorProps) {
  const tx = useTranslate();
  const { updatePrefixAsync, isUpdatingPrefix } = useSettings({ enabled: false });
  const [prefix, setPrefix] = useState(entry.prefix);
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);

  const normalisedPrefix = prefix.trim().toUpperCase();
  const isPrefixValid = PREFIX_PATTERN.test(normalisedPrefix);
  // The preview keeps the server's "/YY-YY/000001" tail and swaps in the typed prefix.
  const numberTail = entry.nextNumberPreview.slice(entry.nextNumberPreview.indexOf("/"));
  const preview = `${normalisedPrefix || "??"}${numberTail}`;
  const inputId = `prefix-${financialYear}-${entry.kind}`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPrefixValid) {
      setShowError(true);
      return;
    }
    try {
      await updatePrefixAsync({
        financialYear,
        kind: entry.kind,
        prefix: normalisedPrefix,
        reason: reason.trim() || undefined,
      });
      toast.success(tx("admin.settings.prefixes.saveSuccess"));
      onDone();
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.settings.prefixes.saveFailed")));
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>
            {tx("admin.settings.prefixes.prefixLabel", {
              kind: tx(`admin.settings.prefixes.kinds.${entry.kind}`),
            })}
          </Label>
          <Input
            id={inputId}
            value={prefix}
            maxLength={2}
            autoCapitalize="characters"
            aria-invalid={showError && !isPrefixValid}
            className="w-20 font-mono uppercase"
            onChange={(event) => {
              setPrefix(event.target.value.toUpperCase());
              setShowError(false);
            }}
          />
        </div>
        <p className="break-all pb-2 font-mono text-xs text-muted-foreground">
          {tx("admin.settings.prefixes.nextNumber", { number: preview })}
        </p>
      </div>
      {showError && !isPrefixValid && (
        <p className="text-xs text-destructive">{tx("admin.settings.prefixes.invalid")}</p>
      )}
      <Input
        aria-label={tx("admin.settings.reasonLabel")}
        placeholder={tx("admin.settings.reasonLabel")}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isUpdatingPrefix}>
          {isUpdatingPrefix ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {tx("admin.settings.prefixes.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {tx("common.actions.cancel")}
        </Button>
      </div>
    </form>
  );
}
