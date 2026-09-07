"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon, PackageIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { getErrorMessage } from "~/lib/get-error-message";
import { useAuth } from "~/hooks/use-auth";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { PageSplashSkeleton } from "~/components/shared/page-splash-skeleton";

const MAX_CATALOG_PAGE_SIZE = 200;

interface CatalogItem {
  varietyId: string;
  varietyName: string;
  unit: string;
  productName: string;
  productImageUrl: string | null;
}

function GatepassPageContent() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSalesmanId = searchParams.get("salesmanId") ?? "";

  const { signedInUser, isSignedInUserLoading, isSignedInUserError } = useAuth();
  const isAdmin = signedInUser?.role === "admin";

  useEffect(() => {
    if (isSignedInUserLoading) return;
    if (!signedInUser || isSignedInUserError) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) router.replace("/salesman");
  }, [signedInUser, isSignedInUserLoading, isSignedInUserError, isAdmin, router]);

  const [selectedSalesmanId, setSelectedSalesmanId] = useState(preselectedSalesmanId);
  const [businessDate, setBusinessDate] = useState(new Date());
  const { searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [quantitiesByVarietyId, setQuantitiesByVarietyId] = useState<Record<string, number>>({});

  const businessDateKey = format(businessDate, "yyyy-MM-dd");

  const { salesmenPage, isSalesmenListLoading } = useSalesmen({
    listFilters: { page: 1, pageSize: MAX_CATALOG_PAGE_SIZE },
  });
  const { productsPage, isProductsListLoading } = useProducts({
    listFilters: {
      searchTerm: debouncedSearchTerm || undefined,
      page: 1,
      pageSize: MAX_CATALOG_PAGE_SIZE,
    },
  });
  const { allotGatepassAsync, isAllottingGatepass } = useGatepasses({
    businessDate: businessDateKey,
  });

  const catalogItems: CatalogItem[] = useMemo(
    () =>
      productsPage.items.flatMap(({ product, varieties }) =>
        varieties.map((variety) => ({
          varietyId: variety.id,
          varietyName: variety.name,
          unit: variety.unit,
          productName: product.name,
          productImageUrl: product.imageUrl,
        })),
      ),
    [productsPage.items],
  );

  const visibleCatalogItems = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    if (!normalizedSearchTerm) return catalogItems;
    return catalogItems.filter((item) =>
      `${item.productName} ${item.varietyName}`.toLowerCase().includes(normalizedSearchTerm),
    );
  }, [catalogItems, searchTerm]);

  const selectedItemCount = Object.values(quantitiesByVarietyId).filter((qty) => qty > 0).length;

  function handleQuantityChange(varietyId: string, quantity: number) {
    setQuantitiesByVarietyId((currentQuantities) => ({
      ...currentQuantities,
      [varietyId]: quantity,
    }));
  }

  async function handleAllotGatepass() {
    if (!selectedSalesmanId) {
      toast.error(tx("Select a salesman"));
      return;
    }
    const items = Object.entries(quantitiesByVarietyId)
      .filter(([, issuedQty]) => issuedQty > 0)
      .map(([varietyId, issuedQty]) => ({ varietyId, issuedQty }));
    if (items.length === 0) {
      toast.error(tx("Set a quantity for at least one item"));
      return;
    }

    try {
      await allotGatepassAsync({
        salesmanId: selectedSalesmanId,
        businessDate: businessDateKey,
        items,
      });
      toast.success(tx("Gate pass allotted"));
      router.push(`/admin/salesman/${selectedSalesmanId}`);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not allot gate pass. Try again.")));
    }
  }

  if (isSignedInUserLoading || !isAdmin) {
    return <PageSplashSkeleton />;
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4 pb-28">
      <BackHeader
        href={preselectedSalesmanId ? `/admin/salesman/${preselectedSalesmanId}` : "/admin"}
        title={tx("Allot Gate Pass")}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">{tx("Date")}</label>
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
              onSelect={(selectedDate) => selectedDate && setBusinessDate(selectedDate)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">{tx("Select Salesman *")}</label>
        <Select value={selectedSalesmanId} onValueChange={setSelectedSalesmanId}>
          <SelectTrigger className="h-11 w-full rounded-xl bg-muted/40">
            <SelectValue
              placeholder={isSalesmenListLoading ? tx("Loading…") : tx("Select salesman")}
            />
          </SelectTrigger>
          <SelectContent>
            {salesmenPage.items.map(({ salesman, profile }) => (
              <SelectItem key={salesman.id} value={salesman.id}>
                {profile.name ?? salesman.salesmanCode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Allocate Items</h2>
          {selectedItemCount > 0 && (
            <span className="text-xs text-muted-foreground">{selectedItemCount} selected</span>
          )}
        </div>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="rounded-full bg-muted/40 pl-9"
          />
        </div>

        <div className="flex flex-col gap-2">
          {isProductsListLoading ? (
            <ListItemSkeleton count={6} />
          ) : visibleCatalogItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No items found</p>
          ) : (
            visibleCatalogItems.map((item) => (
              <div
                key={item.varietyId}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                  {item.productImageUrl ? (
                    <img
                      src={item.productImageUrl}
                      alt={item.productName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <PackageIcon className="size-5 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.productName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.varietyName} ({item.unit})
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-muted-foreground">{tx("Qty")}</span>
                  <QuantityStepper
                    quantity={quantitiesByVarietyId[item.varietyId] ?? 0}
                    onQuantityChange={(quantity) => handleQuantityChange(item.varietyId, quantity)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <Button
          type="button"
          disabled={isAllottingGatepass}
          onClick={() => void handleAllotGatepass()}
          className="h-auto min-h-11 w-full whitespace-normal rounded-full bg-brand py-2.5 text-brand-foreground hover:bg-brand/90"
        >
          {isAllottingGatepass ? tx("Allotting") : tx("Allot Gate Pass")}
        </Button>
      </div>
    </div>
  );
}

export default function GatepassPage() {
  return (
    <Suspense fallback={<PageSplashSkeleton />}>
      <GatepassPageContent />
    </Suspense>
  );
}
