"use client";

import { businessDateOf } from "@repo/trpc/client";
import { Suspense, useMemo, useState } from "react";
import { PackageSearchIcon, SearchIcon, XIcon } from "lucide-react";

import { AddToCartDrawer } from "~/components/salesman/add-to-cart-drawer";
import { ProductCatalogCard } from "~/components/salesman/product-catalog-card";
import { GridItemSkeleton } from "~/components/shared/grid-item-skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

const CATALOG_PAGE_SIZE = 40;

function SalesmanCatalogContent() {
  const tx = useTranslate();
  const { searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // What is left on the Active GatePass, by Variety; null without one (then every product shows).
  const { myGatepass, refetchMyGatepass, isMyGatepassFetching } = useGatepasses({
    businessDate: businessDateOf(new Date()),
    includeMyGatepass: true,
  });
  const sellableByVarietyId = useMemo(() => {
    if (myGatepass?.gatepass.status !== "active") return null;
    return new Map(myGatepass.items.map((item) => [item.varietyId, item.sellableQty]));
  }, [myGatepass]);
  const onlyGatepassProducts = sellableByVarietyId !== null && !showAllProducts;

  const { productsPage, isProductsListLoading, refetchProductsList, isProductsListFetching } =
    useProducts({
      listFilters: {
        searchTerm: debouncedSearchTerm || undefined,
        page: 1,
        pageSize: CATALOG_PAGE_SIZE,
      },
    });
  usePageRefresh(
    () => Promise.all([refetchMyGatepass(), refetchProductsList()]),
    isMyGatepassFetching || isProductsListFetching,
  );
  const isReloading = usePageReloading();

  // By default only the Varieties still on the GatePass; "All" shows the whole catalogue.
  const catalogItems = productsPage.items
    .map(({ product, varieties }) => ({
      product,
      varieties: onlyGatepassProducts
        ? varieties.filter((variety) => (sellableByVarietyId?.get(variety.id) ?? 0) > 0)
        : varieties,
    }))
    .filter(({ varieties }) => !onlyGatepassProducts || varieties.length > 0);
  const openProduct = catalogItems.find(({ product }) => product.id === openProductId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tx("salesman.catalog.searchPlaceholder")}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="h-11 rounded-full bg-muted/40 pl-9 pr-11"
          />
          {searchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={tx("common.actions.clearSearch")}
              onClick={() => setSearchTerm("")}
              className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 rounded-full text-muted-foreground"
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
        {sellableByVarietyId && (
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              id="catalog-show-all"
              checked={showAllProducts}
              onCheckedChange={setShowAllProducts}
            />
            <Label htmlFor="catalog-show-all" className="text-sm">
              {tx("salesman.catalog.showAll")}
            </Label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isProductsListLoading || (isReloading && isProductsListFetching) ? (
          <GridItemSkeleton count={6} />
        ) : catalogItems.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
            <PackageSearchIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {debouncedSearchTerm
                ? tx("salesman.catalog.noMatch", { term: debouncedSearchTerm })
                : onlyGatepassProducts
                  ? tx("salesman.catalog.emptyGatepass")
                  : tx("salesman.catalog.empty")}
            </p>
          </div>
        ) : (
          catalogItems.map(({ product, varieties }) => (
            <ProductCatalogCard
              key={product.id}
              productId={product.id}
              productName={product.name}
              productImageUrl={product.imageUrl}
              varietyCount={varieties.length}
              onAddToCart={() => setOpenProductId(product.id)}
            />
          ))
        )}
      </div>

      {openProduct && (
        <AddToCartDrawer
          open={Boolean(openProductId)}
          onOpenChange={(open) => setOpenProductId(open ? openProduct.product.id : null)}
          productId={openProduct.product.id}
          productName={openProduct.product.name}
          productImageUrl={openProduct.product.imageUrl}
          varieties={openProduct.varieties.map((variety) => ({
            varietyId: variety.id,
            sku: variety.sku,
            varietyName: variety.displayName,
            sellableQty: sellableByVarietyId
              ? (sellableByVarietyId.get(variety.id) ?? 0)
              : undefined,
          }))}
        />
      )}
    </div>
  );
}

export default function SalesmanPage() {
  return (
    <Suspense>
      <SalesmanCatalogContent />
    </Suspense>
  );
}
