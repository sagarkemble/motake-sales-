"use client";

import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";

interface DiscrepancyPanelProps {
  businessDate: string;
}

export function DiscrepancyPanel({ businessDate }: DiscrepancyPanelProps) {
  const formatDate = useFormatDate();
  const { discrepancies, isDiscrepanciesLoading } = useGatepasses({
    businessDate: businessDate || undefined,
    includeDiscrepancies: true,
  });

  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s discrepancies</h2>
        {discrepancies.length > 0 && (
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            {discrepancies.length} flagged
          </Badge>
        )}
      </div>

      {isDiscrepanciesLoading ? (
        <ListItemSkeleton count={3} />
      ) : discrepancies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2Icon className="size-6 text-emerald-500" />
          <p className="text-sm text-muted-foreground">No discrepancies flagged today</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {discrepancies.map((discrepancy) => (
            <div
              key={discrepancy.gatepassId}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/10">
                  <TriangleAlertIcon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {discrepancy.salesmanName ?? discrepancy.salesmanCode}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {discrepancy.salesmanCode}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {discrepancy.discrepancyReason ?? "No reason recorded"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Issued {discrepancy.totalIssuedQty} · Sold {discrepancy.totalSoldQty} · Returned{" "}
                    {discrepancy.totalReturnedQty}
                    {discrepancy.closedByName ? ` · by ${discrepancy.closedByName}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {discrepancy.totalShortQty > 0 && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    {discrepancy.totalShortQty} short
                  </Badge>
                )}
                {discrepancy.closedAt && (
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(new Date(discrepancy.closedAt), "d MMM, h:mm a")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
