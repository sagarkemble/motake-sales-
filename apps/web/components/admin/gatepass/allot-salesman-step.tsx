"use client";

import { CalendarIcon } from "lucide-react";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { RouteTag } from "~/components/shared/route-tag";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { useFormatDate } from "~/hooks/use-format-date";
import type { DayGatepass } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export interface AllotSalesmanOption {
  id: string;
  name: string;
}

interface AllotSalesmanStepProps {
  businessDate: Date;
  onBusinessDateChange: (businessDate: Date) => void;
  salesmen: AllotSalesmanOption[];
  isSalesmenLoading: boolean;
  dayGatepasses: DayGatepass[];
  selectedSalesmanId: string;
  onSelectSalesman: (salesmanId: string) => void;
}

/** Step 1: the business date and the salesman, with what each already holds that day. */
export function AllotSalesmanStep({
  businessDate,
  onBusinessDateChange,
  salesmen,
  isSalesmenLoading,
  dayGatepasses,
  selectedSalesmanId,
  onSelectSalesman,
}: AllotSalesmanStepProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="allot-business-date">{tx("common.fields.date")}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="allot-business-date"
              type="button"
              variant="outline"
              className="h-11 justify-between rounded-xl bg-muted-soft font-normal"
            >
              {formatDate(businessDate, "d MMM yyyy")}
              <CalendarIcon className="size-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={businessDate}
              onSelect={(selectedDate) => selectedDate && onBusinessDateChange(selectedDate)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{tx("admin.gatepass.allot.selectSalesman")}</p>
        {isSalesmenLoading ? (
          <ListItemSkeleton count={3} />
        ) : (
          salesmen.map((salesman) => {
            const salesmanGatepasses = dayGatepasses.filter(
              (gatepass) => gatepass.salesmanId === salesman.id,
            );
            // Only the Active GatePass blocks a new allotment, so only it is shown; ended ones are a count.
            const activeGatepass = salesmanGatepasses.find(
              (gatepass) => gatepass.status === "active",
            );
            const endedCount = salesmanGatepasses.length - (activeGatepass ? 1 : 0);
            const isSelected = selectedSalesmanId === salesman.id;
            return (
              <button
                key={salesman.id}
                type="button"
                onClick={() => onSelectSalesman(salesman.id)}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors",
                  isSelected ? "border-brand bg-accent" : "hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{salesman.name}</span>
                  {activeGatepass ? (
                    <span className="text-xs text-amber-600">
                      {tx("admin.gatepass.allot.hasActive")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {tx("admin.gatepass.allot.freeToAllot")}
                    </span>
                  )}
                </div>
                {activeGatepass && (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <GatepassStatusBadge
                      status={activeGatepass.status}
                      hasDiscrepancy={activeGatepass.hasDiscrepancy}
                    />
                    <RouteTag name={activeGatepass.routeName} code={activeGatepass.routeCode} />
                  </span>
                )}
                {endedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {endedCount === 1
                      ? tx("admin.gatepass.allot.earlierOne")
                      : tx("admin.gatepass.allot.earlierOther", { count: endedCount })}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
