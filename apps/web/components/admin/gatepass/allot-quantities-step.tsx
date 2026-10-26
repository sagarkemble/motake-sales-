"use client";

import { useState } from "react";
import { PackageIcon, SearchIcon } from "lucide-react";

import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export interface AllotCatalogItem {
  varietyId: string;
  varietyName: string;
  unit: string;
  productName: string;
  productImageUrl: string | null;
}

interface AllotQuantitiesStepProps {
  routeName: string;
  catalogItems: AllotCatalogItem[];
  isCatalogLoading: boolean;
  pricedVarietyIds: Set<string>;
  quantitiesByVarietyId: Record<string, number>;
  onQuantityChange: (varietyId: string, quantity: number) => void;
}

/**
 * Step 3: quantities for varieties priced on the chosen Route. Varieties with no price there are
 * listed apart, marked, and cannot be given a quantity.
 */
export function AllotQuantitiesStep({
  routeName,
  catalogItems,
  isCatalogLoading,
  pricedVarietyIds,
  quantitiesByVarietyId,
  onQuantityChange,
}: AllotQuantitiesStepProps) {
  const tx = useTranslate();
  const [searchTerm, setSearchTerm] = useState("");
  const [showUnpriced, setShowUnpriced] = useState(false);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const visibleItems = catalogItems.filter(
    (item) =>
      !normalizedSearchTerm ||
      `${item.productName} ${item.varietyName}`.toLowerCase().includes(normalizedSearchTerm),
  );
  const pricedItems = visibleItems.filter((item) => pricedVarietyIds.has(item.varietyId));
  const unpricedItems = visibleItems.filter((item) => !pricedVarietyIds.has(item.varietyId));
  const selectedItemCount = pricedItems.filter(
    (item) => (quantitiesByVarietyId[item.varietyId] ?? 0) > 0,
  ).length;

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
          className="rounded-full bg-muted/40 pl-9"
        />
      </div>

      {isCatalogLoading ? (
        <ListItemSkeleton count={6} />
      ) : (
        <>
          <ProductGroups
            items={pricedItems}
            quantitiesByVarietyId={quantitiesByVarietyId}
            onQuantityChange={onQuantityChange}
          />

          {unpricedItems.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowUnpriced((isShown) => !isShown)}
                className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {showUnpriced
                  ? tx("admin.gatepass.allot.hideUnpriced", {
                      count: unpricedItems.length,
                      route: routeName,
                    })
                  : tx("admin.gatepass.allot.showUnpriced", {
                      count: unpricedItems.length,
                      route: routeName,
                    })}
              </button>
              {showUnpriced &&
                unpricedItems.map((item) => <VarietyRow key={item.varietyId} item={item} />)}
            </div>
          )}

          {visibleItems.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tx("admin.gatepass.allot.noItems")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ProductGroups({
  items,
  quantitiesByVarietyId,
  onQuantityChange,
}: {
  items: AllotCatalogItem[];
  quantitiesByVarietyId: Record<string, number>;
  onQuantityChange: (varietyId: string, quantity: number) => void;
}) {
  const productNames = [...new Set(items.map((item) => item.productName))];

  return (
    <div className="flex flex-col gap-4">
      {productNames.map((productName) => (
        <div key={productName} className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {productName}
          </p>
          {items
            .filter((item) => item.productName === productName)
            .map((item) => (
              <VarietyRow
                key={item.varietyId}
                item={item}
                quantity={quantitiesByVarietyId[item.varietyId] ?? 0}
                onQuantityChange={(quantity) => onQuantityChange(item.varietyId, quantity)}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function VarietyRow({
  item,
  quantity,
  onQuantityChange,
}: {
  item: AllotCatalogItem;
  quantity?: number;
  // Absent for a variety with no price on the Route: it cannot be given a quantity.
  onQuantityChange?: (quantity: number) => void;
}) {
  const tx = useTranslate();
  const isUnpriced = !onQuantityChange;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3",
        isUnpriced && "border-dashed bg-muted/30",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
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
        <p className="truncate text-xs text-muted-foreground">
          {item.varietyName} ({item.unit})
        </p>
      </div>
      {onQuantityChange ? (
        <div className="ml-auto">
          <QuantityStepper quantity={quantity ?? 0} onQuantityChange={onQuantityChange} />
        </div>
      ) : (
        <Badge variant="outline" className="ml-auto border-dashed text-muted-foreground">
          {tx("admin.gatepass.allot.noPriceOnRoute")}
        </Badge>
      )}
    </div>
  );
}
