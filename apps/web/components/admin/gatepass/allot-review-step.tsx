"use client";

import { CheckIcon, ChevronLeftIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";

import type { AllotCatalogItem } from "./allot-quantities-step";
import { RouteFixedCard } from "./route-fixed-card";

export interface AllotReviewItem {
  item: AllotCatalogItem;
  issuedQty: number;
}

interface AllotReviewStepProps {
  salesmanName: string;
  businessDate: Date;
  routeName: string;
  routeCode: string;
  reviewItems: AllotReviewItem[];
  refusal: string | null;
  isAllotting: boolean;
  onChangeRoute: () => void;
  onAllot: () => void;
}

/** Step 4: everything that goes on the GatePass, and the server's refusal if it says no. */
export function AllotReviewStep({
  salesmanName,
  businessDate,
  routeName,
  routeCode,
  reviewItems,
  refusal,
  isAllotting,
  onChangeRoute,
  onAllot,
}: AllotReviewStepProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{tx("admin.gatepass.allot.salesman")}</p>
          <p className="font-medium">{salesmanName}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{tx("common.fields.date")}</p>
          <p className="font-medium">{formatDate(businessDate, "d MMM yyyy")}</p>
        </div>
      </div>
      <RouteFixedCard routeName={routeName} routeCode={routeCode} />
      <div className="flex flex-col divide-y rounded-xl border">
        {reviewItems.map(({ item, issuedQty }) => (
          <div
            key={item.varietyId}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0">
              {item.productName}{" "}
              <span className="text-muted-foreground">
                {item.varietyName} ({item.unit})
              </span>
            </span>
            <span className="font-semibold tabular-nums">{issuedQty}</span>
          </div>
        ))}
      </div>
      {refusal && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{refusal}</span>
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onChangeRoute}>
          <ChevronLeftIcon className="size-4" />
          {tx("admin.gatepass.allot.changeRoute")}
        </Button>
        <Button
          type="button"
          disabled={isAllotting || reviewItems.length === 0}
          onClick={onAllot}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <CheckIcon className="size-4" />
          {isAllotting ? tx("admin.gatepass.allot.allotting") : tx("admin.gatepass.allot.cta")}
        </Button>
      </div>
    </div>
  );
}
