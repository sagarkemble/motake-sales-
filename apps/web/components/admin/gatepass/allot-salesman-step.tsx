"use client";

import { CalendarIcon } from "lucide-react";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { RouteTag } from "~/components/shared/route-tag";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
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
        <label className="text-sm font-medium">{tx("common.fields.date")}</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-between rounded-xl bg-muted/40 font-normal"
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
          <p className="text-sm text-muted-foreground">{tx("common.status.loading")}</p>
        ) : (
          salesmen.map((salesman) => {
            const salesmanGatepasses = dayGatepasses.filter(
              (gatepass) => gatepass.salesmanId === salesman.id,
            );
            const hasActiveGatepass = salesmanGatepasses.some(
              (gatepass) => gatepass.status === "active",
            );
            const isSelected = selectedSalesmanId === salesman.id;
            return (
              <button
                key={salesman.id}
                type="button"
                onClick={() => onSelectSalesman(salesman.id)}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors",
                  isSelected ? "border-brand bg-accent/50 ring-1 ring-brand" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{salesman.name}</span>
                  {hasActiveGatepass ? (
                    <span className="text-xs text-amber-700">
                      {tx("admin.gatepass.allot.hasActive")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {tx("admin.gatepass.allot.freeToAllot")}
                    </span>
                  )}
                </div>
                {salesmanGatepasses.map((gatepass) => (
                  <span
                    key={gatepass.id}
                    className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                  >
                    <GatepassStatusBadge
                      status={gatepass.status}
                      hasDiscrepancy={gatepass.hasDiscrepancy}
                    />
                    <RouteTag name={gatepass.routeName} code={gatepass.routeCode} />
                  </span>
                ))}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
