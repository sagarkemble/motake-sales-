"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { PackageIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { Badge } from "~/components/ui/badge";
import { ListPager } from "~/components/shared/list-pager";
import { GridItemSkeleton } from "~/components/shared/grid-item-skeleton";
import { useProducts } from "~/hooks/use-products";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

function ProductsPageContent() {
  const tx = useTranslate();
  const pageSize = 20;
  const { page, setPage, searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { productsPage, isProductsListLoading, refetchProductsList, isProductsListFetching } =
    useProducts({
      listFilters: { searchTerm: debouncedSearchTerm || undefined, page, pageSize, includeDeleted },
    });
  usePageRefresh(refetchProductsList, isProductsListFetching);
  const isReloading = usePageReloading();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={tx("admin.products.searchPlaceholder")}
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
        <Button
          asChild
          size="icon"
          className="size-9 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/admin/products/new" aria-label={tx("admin.products.newAria")}>
            <PlusIcon />
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={includeDeleted}
            onCheckedChange={(checked) => setIncludeDeleted(checked === true)}
            className="data-[state=checked]:border-brand data-[state=checked]:bg-brand"
          />
          {tx("admin.products.showDeleted")}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {isProductsListLoading || (isReloading && isProductsListFetching) ? (
          <GridItemSkeleton count={6} />
        ) : productsPage.items.length === 0 ? (
          debouncedSearchTerm ? (
            <EmptyStateCard
              media="square"
              title={tx("empty.noMatch.title", { term: debouncedSearchTerm })}
              body={tx("empty.noMatch.body")}
              action={{ label: tx("empty.actions.clearSearch"), onClick: () => setSearchTerm("") }}
            />
          ) : (
            <EmptyStateCard
              media="square"
              title={tx("empty.products.title")}
              body={tx("empty.products.body")}
              action={{
                label: tx("empty.actions.addProduct"),
                icon: PlusIcon,
                href: "/admin/products/new",
              }}
            />
          )
        ) : (
          productsPage.items.map(({ product, varieties }) => {
            const activeVarieties = varieties.filter((variety) => variety.status === "active");
            const inactiveCount = varieties.length - activeVarieties.length;
            return (
              <div
                key={product.id}
                className={`flex flex-col gap-2.5 rounded-2xl border bg-card shadow-sm p-3 transition-colors hover:bg-accent ${
                  product.deletedAt ? "opacity-60" : ""
                }`}
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted-soft">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="size-full object-contain p-3"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <PackageIcon className="size-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                    <StatusBadge status={product.status} />
                    {product.deletedAt && (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-destructive/10 text-destructive"
                      >
                        {tx("common.status.deleted")}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {varieties.length === 0
                      ? tx("admin.varieties.empty")
                      : tx(
                          varieties.length === 1
                            ? "admin.products.varietyCountOne"
                            : "admin.products.varietyCountOther",
                          { count: varieties.length },
                        )}
                    {inactiveCount > 0 &&
                      ` · ${tx("admin.products.inactiveCount", { count: inactiveCount })}`}
                  </p>
                  {activeVarieties.length > 0 && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/80">
                      {activeVarieties.map((variety) => variety.name).join(" · ")}
                    </p>
                  )}
                </div>

                <Button
                  asChild={!product.deletedAt}
                  size="sm"
                  variant="outline"
                  disabled={Boolean(product.deletedAt)}
                  className="w-full rounded-full border-brand text-brand hover:bg-brand-soft hover:text-brand"
                >
                  {product.deletedAt ? (
                    tx("admin.products.edit")
                  ) : (
                    <Link href={`/admin/products/${product.id}`}>{tx("admin.products.edit")}</Link>
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <ListPager
        page={productsPage.page}
        totalPages={productsPage.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-3 px-4 py-4 sm:px-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <GridItemSkeleton count={8} />
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
