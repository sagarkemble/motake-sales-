"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { ChevronDownIcon, HistoryIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useSettingsHistory, type SettingsHistorySubject } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

type SettingsHistoryEntry = RouterOutputs["settings"]["seller"]["history"]["data"][number];

// The year and kind are shown by the item the history belongs to.
const HIDDEN_PAYLOAD_FIELDS = new Set(["financialYear", "kind"]);
const DATE_PAYLOAD_FIELDS = new Set(["deadlineDate", "defaultDate"]);

interface PayloadLine {
  field: string;
  oldValue?: string | null;
  newValue: string | null;
  isChange: boolean;
}

function isOldNewChange(value: unknown): value is { old: unknown; new: unknown } {
  return typeof value === "object" && value !== null && "old" in value && "new" in value;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function payloadLines(payload: unknown): PayloadLine[] {
  if (typeof payload !== "object" || payload === null) return [];
  return Object.entries(payload)
    .filter(([field]) => !HIDDEN_PAYLOAD_FIELDS.has(field))
    .map(([field, value]) =>
      isOldNewChange(value)
        ? { field, oldValue: asText(value.old), newValue: asText(value.new), isChange: true }
        : { field, newValue: asText(value), isChange: false },
    );
}

export function SettingsHistoryList({ entries }: { entries: SettingsHistoryEntry[] }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  function displayValue(field: string, value: string | null | undefined) {
    if (value === null || value === undefined) return null;
    return DATE_PAYLOAD_FIELDS.has(field) ? formatDate(`${value}T00:00:00`, "d MMM yyyy") : value;
  }

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">{tx("admin.settings.history.empty")}</p>;
  }

  return (
    <ol className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border bg-card px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="font-medium">
              {entry.actorName} ·{" "}
              {entry.action === "created"
                ? tx("admin.settings.history.created")
                : tx("admin.settings.history.updated")}
            </span>
            <span className="text-muted-foreground">
              {formatDate(entry.createdAt, "d MMM yyyy, h:mm a")}
            </span>
          </div>
          {payloadLines(entry.payload).map((line) => (
            <p key={line.field} className="mt-1 break-words">
              <span className="text-muted-foreground">
                {tx(`admin.settings.fields.${line.field}`)}:{" "}
              </span>
              {line.isChange && (
                <>
                  {line.oldValue === null ? (
                    <span className="text-muted-foreground">
                      {tx("admin.settings.history.none")}
                    </span>
                  ) : (
                    <span className="line-through decoration-muted-foreground/60">
                      {displayValue(line.field, line.oldValue)}
                    </span>
                  )}{" "}
                  →{" "}
                </>
              )}
              <span className="font-medium">
                {displayValue(line.field, line.newValue) ?? tx("admin.settings.history.emptyValue")}
              </span>
            </p>
          ))}
          {entry.reason && <p className="mt-1 italic text-muted-foreground">“{entry.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}

function SettingsHistoryContent({ subject }: { subject: SettingsHistorySubject }) {
  const tx = useTranslate();
  const { history, isHistoryLoading, isHistoryError, refetchHistory } = useSettingsHistory(
    subject,
    true,
  );

  if (isHistoryLoading) return <Skeleton className="h-14 w-full rounded-lg" />;
  if (isHistoryError) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {tx("admin.settings.history.loadFailed")}
        <Button variant="outline" size="sm" onClick={() => void refetchHistory()}>
          {tx("common.actions.tryAgain")}
        </Button>
      </div>
    );
  }
  return <SettingsHistoryList entries={history} />;
}

// Collapsed by default; the history is fetched only when opened.
export function SettingsHistoryToggle({ subject }: { subject: SettingsHistorySubject }) {
  const tx = useTranslate();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <HistoryIcon className="size-3.5" />
        {tx("admin.settings.history.title")}
        <ChevronDownIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {isOpen && <SettingsHistoryContent subject={subject} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SellerSettingsHistory() {
  const tx = useTranslate();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{tx("admin.settings.history.sellerTitle")}</h3>
      <SettingsHistoryContent subject={{ kind: "seller" }} />
    </section>
  );
}
