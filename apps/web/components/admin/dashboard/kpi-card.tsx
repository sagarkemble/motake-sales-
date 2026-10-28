"use client";

import { ArrowDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  previousValue?: number;
  /** Used for vs-yesterday % when `value` is a formatted string. */
  numericValue?: number;
  className?: string;
}

function getPercentChangeLabel(value: number, previousValue: number): string | null {
  if (previousValue === 0) return value === 0 ? null : "common.status.new";
  const percentChange = Math.round(((value - previousValue) / previousValue) * 100);
  if (percentChange === 0) return "0%";
  return `${percentChange > 0 ? "+" : ""}${percentChange}%`;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  previousValue,
  numericValue,
  className,
}: KpiCardProps) {
  const tx = useTranslate();
  const comparableValue = numericValue ?? (typeof value === "number" ? value : undefined);
  const hasPreviousValue = previousValue !== undefined && comparableValue !== undefined;
  const percentChangeLabel = hasPreviousValue
    ? getPercentChangeLabel(comparableValue, previousValue)
    : null;
  const isIncrease = hasPreviousValue && comparableValue > previousValue;
  const isDecrease = hasPreviousValue && comparableValue < previousValue;
  const displayPercentLabel =
    percentChangeLabel === "common.status.new" ? tx("common.status.new") : percentChangeLabel;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-card p-3.5 shadow-sm transition-colors sm:p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/10">
          <Icon className="size-4" />
        </div>
        {displayPercentLabel && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              isIncrease && "bg-brand/10 text-brand",
              isDecrease && "bg-destructive/10 text-destructive",
              !isIncrease && !isDecrease && "bg-muted text-muted-foreground",
            )}
          >
            {isIncrease && <ArrowUpIcon className="size-2.5" />}
            {isDecrease && <ArrowDownIcon className="size-2.5" />}
            {displayPercentLabel}
          </span>
        )}
      </div>
      <div>
        <p className="text-xl font-semibold leading-none sm:text-2xl">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{tx(label)}</p>
        {percentChangeLabel && (
          <p className="text-[10px] text-muted-foreground/70">
            {tx("admin.dashboard.kpi.vsYesterday")}
          </p>
        )}
      </div>
    </div>
  );
}
