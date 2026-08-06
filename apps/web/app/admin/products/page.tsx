"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { PackageIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { GridItemSkeleton } from "~/components/shared/grid-item-skeleton";
import { useProducts } from "~/hooks/use-products";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";

function ProductsPageContent() {
  const pageSize = 20;
  const { page, setPage, searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { productsPage, isProductsListLoading } = useProducts({
    listFilters: { searchTerm: debouncedSearchTerm || undefined, page, pageSize, includeDeleted },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="rounded-full bg-muted/40 pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
          <Link href="/admin/products/new" aria-label="New product">
            <PlusIcon />
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(event) => setIncludeDeleted(event.target.checked)}
            className="rounded border-gray-300"
          />
          Show deleted products
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {isProductsListLoading ? (
          <GridItemSkeleton count={6} />
        ) : productsPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {debouncedSearchTerm ? `No products match "${debouncedSearchTerm}"` : "No products yet"}
          </p>
        ) : (
          productsPage.items.map(({ product, varieties }) => (
            <div
              key={product.id}
              className={`flex flex-col gap-2.5 rounded-3xl border bg-card p-3 shadow-sm transition-colors hover:border-brand/40 hover:shadow-md ${
                product.deletedAt ? "opacity-60" : ""
              }`}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted/40">
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
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      Deleted
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {varieties.length} {varieties.length === 1 ? "variety" : "varieties"}
                </p>
              </div>

              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full rounded-full border-brand text-brand hover:bg-brand/10 hover:text-brand"
              >
                <Link href={`/admin/products/${product.id}`}>Edit</Link>
              </Button>
            </div>
          ))
        )}
      </div>

      {productsPage.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {productsPage.page} of {productsPage.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={productsPage.page <= 1}
              onClick={() => setPage(productsPage.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={productsPage.page >= productsPage.totalPages}
              onClick={() => setPage(productsPage.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <GridItemSkeleton count={8} />
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
