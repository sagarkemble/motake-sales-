"use client";

import { useState } from "react";
import Link from "next/link";
import { PackageIcon, SearchIcon, XIcon } from "lucide-react";

import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export interface AllotCatalogItem {
  varietyId: string;
  varietyName: string;
  productName: string;
  productImageUrl: string | null;
}

interface AllotQuantitiesStepProps {
  routeId: string;
  routeName: string;
  catalogItems: AllotCatalogItem[];
  isCatalogLoading: boolean;
  pricedVarietyIds: Set<string>;
  quantitiesByVarietyId: Record<string, number>;
  onQuantityChange: (varietyId: string, quantity: number) => void;
}

/**
 * Step 3: every active variety in one scrolling list about ten rows tall. Those priced on the
 * chosen Route take a quantity; the server refuses the others, so they link to the Route's prices.
 */
export function AllotQuantitiesStep({
  routeId,
  routeName,
  catalogItems,
  isCatalogLoading,
  pricedVarietyIds,
  quantitiesByVarietyId,
  onQuantityChange,
}: AllotQuantitiesStepProps) {
  const tx = useTranslate();
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleItems = catalogItems.filter(
    (item) =>
      !normalizedSearchTerm ||
      `${item.productName} ${item.varietyName}`.toLowerCase().includes(normalizedSearchTerm),
  );
  const selectedItemCount = visibleItems.filter(
    (item) =>
      pricedVarietyIds.has(item.varietyId) && (quantitiesByVarietyId[item.varietyId] ?? 0) > 0,
  ).length;
  const unpricedCount = catalogItems.filter((item) => !pricedVarietyIds.has(item.varietyId)).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{tx("admin.gatepass.allot.allocateItems")}</h2>
        {selectedItemCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {tx("admin.gatepass.allot.selectedCount", { count: selectedItemCount })}
          </span>
        )}
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={tx("admin.gatepass.allot.searchItems")}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="rounded-full bg-muted-soft pl-9 pr-9"
        />
        {searchTerm && (
          <button
            type="button"
            aria-label={tx("common.actions.clearSearch")}
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {unpricedCount > 0 && !isCatalogLoading && (
        <p className="text-xs text-muted-foreground">
          {tx("admin.gatepass.allot.unpricedHint", { count: unpricedCount, route: routeName })}
        </p>
      )}

      {isCatalogLoading ? (
        <ListItemSkeleton count={6} />
      ) : visibleItems.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tx("admin.gatepass.allot.noItems")}
        </p>
      ) : (
        // About ten rows tall; the list scrolls inside it.
        <ScrollArea className="flex flex-col rounded-2xl border bg-muted-faint [&>[data-slot=scroll-area-viewport]]:max-h-[36rem]">
          <div className="p-2">
            <ProductGroups
              items={visibleItems}
              routeId={routeId}
              pricedVarietyIds={pricedVarietyIds}
              quantitiesByVarietyId={quantitiesByVarietyId}
              onQuantityChange={onQuantityChange}
            />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function ProductGroups({
  items,
  routeId,
  pricedVarietyIds,
  quantitiesByVarietyId,
  onQuantityChange,
}: {
  items: AllotCatalogItem[];
  routeId: string;
  pricedVarietyIds: Set<string>;
  quantitiesByVarietyId: Record<string, number>;
  onQuantityChange: (varietyId: string, quantity: number) => void;
}) {
  const productNames = [...new Set(items.map((item) => item.productName))];

  return (
    <div className="flex flex-col gap-3">
      {productNames.map((productName) => (
        <div key={productName} className="flex flex-col gap-1.5">
          <p className="px-1 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {productName}
          </p>
          {items
            .filter((item) => item.productName === productName)
            .map((item) => (
              <VarietyRow
                key={item.varietyId}
                item={item}
                routeId={routeId}
                quantity={quantitiesByVarietyId[item.varietyId] ?? 0}
                onQuantityChange={
                  pricedVarietyIds.has(item.varietyId)
                    ? (quantity) => onQuantityChange(item.varietyId, quantity)
                    : undefined
                }
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function VarietyRow({
  item,
  routeId,
  quantity,
  onQuantityChange,
}: {
  item: AllotCatalogItem;
  routeId: string;
  quantity?: number;
  // Absent for a variety with no price on the Route: it cannot be given a quantity.
  onQuantityChange?: (quantity: number) => void;
}) {
  const tx = useTranslate();
  const isUnpriced = !onQuantityChange;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2",
        isUnpriced && "border-dashed bg-muted-faint",
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted-soft">
        {item.productImageUrl ? (
          <img
            src={item.productImageUrl}
            alt={item.productName}
            className={cn("size-full object-cover", isUnpriced && "opacity-50")}
          />
        ) : (
          <PackageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", isUnpriced && "text-muted-foreground")}>
          {item.productName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.varietyName}</p>
      </div>
      {onQuantityChange ? (
        <div className="ml-auto">
          <QuantityStepper quantity={quantity ?? 0} onQuantityChange={onQuantityChange} />
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="border-dashed text-muted-foreground">
            {tx("admin.gatepass.allot.noPriceOnRoute")}
          </Badge>
          <Link
            href={`/admin/routes?route=${routeId}`}
            className="text-xs font-medium text-brand underline-offset-4 hover:underline"
          >
            {tx("admin.gatepass.allot.setPrice")}
          </Link>
        </div>
      )}
    </div>
  );
}
