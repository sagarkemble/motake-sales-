import { ArrowDownIcon, ArrowUpIcon, type LucideIcon } from "lucide-react";

import { cn } from "~/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  previousValue?: number;
  className?: string;
}

function getPercentChangeLabel(value: number, previousValue: number): string | null {
  if (previousValue === 0) return value === 0 ? null : "New";
  const percentChange = Math.round(((value - previousValue) / previousValue) * 100);
  if (percentChange === 0) return "0%";
  return `${percentChange > 0 ? "+" : ""}${percentChange}%`;
}

export function KpiCard({ label, value, icon: Icon, previousValue, className }: KpiCardProps) {
  const hasPreviousValue = previousValue !== undefined;
  const percentChangeLabel = hasPreviousValue ? getPercentChangeLabel(value, previousValue) : null;
  const isIncrease = hasPreviousValue && value > previousValue;
  const isDecrease = hasPreviousValue && value < previousValue;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-gradient-to-b from-card to-card/60 p-3.5 shadow-sm ring-1 ring-black/[0.02] transition-colors sm:p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/10">
          <Icon className="size-4" />
        </div>
        {percentChangeLabel && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              isIncrease && "bg-emerald-500/10 text-emerald-600",
              isDecrease && "bg-destructive/10 text-destructive",
              !isIncrease && !isDecrease && "bg-muted text-muted-foreground",
            )}
          >
            {isIncrease && <ArrowUpIcon className="size-2.5" />}
            {isDecrease && <ArrowDownIcon className="size-2.5" />}
            {percentChangeLabel}
          </span>
        )}
      </div>
      <div>
        <p className="text-xl font-semibold leading-none sm:text-2xl">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
