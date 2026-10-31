"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AllotQuantitiesStep,
  type AllotCatalogItem,
} from "~/components/admin/gatepass/allot-quantities-step";
import {
  AllotReviewStep,
  type AllotReviewItem,
} from "~/components/admin/gatepass/allot-review-step";
import { AllotRouteStep } from "~/components/admin/gatepass/allot-route-step";
import { AllotSalesmanStep } from "~/components/admin/gatepass/allot-salesman-step";
import { GatepassDayList } from "~/components/admin/gatepass/gatepass-day-list";
import { RouteFixedCard } from "~/components/admin/gatepass/route-fixed-card";
import { BackHeader } from "~/components/admin/products/back-header";
import { RouteTag } from "~/components/shared/route-tag";
import { Button } from "~/components/ui/button";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";
import { useRoutes } from "~/hooks/use-routes";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";

const MAX_CATALOG_PAGE_SIZE = 200;
const STEP_LABEL_KEYS = [
  "admin.gatepass.allot.steps.salesman",
  "admin.gatepass.allot.steps.route",
  "admin.gatepass.allot.steps.quantities",
  "admin.gatepass.allot.steps.review",
] as const;

interface AllottedGatepass {
  salesmanId: string;
  salesmanName: string;
  businessDate: Date;
  routeName: string;
  routeCode: string;
  reviewItems: AllotReviewItem[];
}

function GatepassPageContent() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const searchParams = useSearchParams();
  const preselectedSalesmanId = searchParams.get("salesmanId") ?? "";

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedSalesmanId, setSelectedSalesmanId] = useState(preselectedSalesmanId);
  const [businessDate, setBusinessDate] = useState(new Date());
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [quantitiesByVarietyId, setQuantitiesByVarietyId] = useState<Record<string, number>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [allottedGatepass, setAllottedGatepass] = useState<AllottedGatepass | null>(null);

  const businessDateKey = format(businessDate, "yyyy-MM-dd");

  const { salesmenPage, isSalesmenListLoading } = useSalesmen({
    listFilters: { page: 1, pageSize: MAX_CATALOG_PAGE_SIZE },
  });
  const { productsPage, isProductsListLoading } = useProducts({
    listFilters: { page: 1, pageSize: MAX_CATALOG_PAGE_SIZE },
  });
  const {
    gatepasses: dayGatepasses,
    allotmentMatrix,
    isGatepassesLoading,
    isAllotmentMatrixLoading,
    allotGatepassAsync,
    isAllottingGatepass,
  } = useGatepasses({ businessDate: businessDateKey, includeAdminOverview: true });
  const { routeChoices, isRouteChoicesLoading, routes } = useRoutes({
    choicesFilters: {},
    listFilters: { includeHidden: false },
  });
  const { routePriceForm, isRouteLoading: isRoutePricesLoading } = useRoutes({
    routeId: selectedRouteId || undefined,
  });

  const salesmen = useMemo(
    () =>
      salesmenPage.items.map(({ salesman, profile }) => ({
        id: salesman.id,
        name: profile.name ?? salesman.salesmanCode,
      })),
    [salesmenPage.items],
  );

  // Only active varieties of active products can go on a GatePass.
  const catalogItems: AllotCatalogItem[] = useMemo(
    () =>
      productsPage.items
        .filter(({ product }) => product.status === "active" && !product.deletedAt)
        .flatMap(({ product, varieties }) =>
          varieties
            .filter((variety) => variety.status === "active" && !variety.deletedAt)
            .map((variety) => ({
              varietyId: variety.id,
              varietyName: variety.displayName,
              productName: product.name,
              productImageUrl: product.imageUrl,
            })),
        ),
    [productsPage.items],
  );

  const pricedCountByRouteId = useMemo(
    () => new Map(routes.map((route) => [route.id, route.pricedVarietyCount])),
    [routes],
  );
  const pricedVarietyIds = useMemo(
    () =>
      new Set(
        routePriceForm
          .filter((variety) => variety.pricePaise != null)
          .map((variety) => variety.varietyId),
      ),
    [routePriceForm],
  );

  const selectedSalesman = salesmen.find((salesman) => salesman.id === selectedSalesmanId);
  const selectedRoute = routeChoices.find((route) => route.id === selectedRouteId);
  const selectedSalesmanHasActiveGatepass = dayGatepasses.some(
    (gatepass) => gatepass.salesmanId === selectedSalesmanId && gatepass.status === "active",
  );
  // Quantities typed for a variety the chosen Route does not price are not allotted.
  const reviewItems: AllotReviewItem[] = catalogItems
    .filter(
      (item) =>
        pricedVarietyIds.has(item.varietyId) && (quantitiesByVarietyId[item.varietyId] ?? 0) > 0,
    )
    .map((item) => ({ item, issuedQty: quantitiesByVarietyId[item.varietyId] ?? 0 }));

  const canGoNext = [
    Boolean(selectedSalesmanId) && !selectedSalesmanHasActiveGatepass,
    Boolean(selectedRoute),
    reviewItems.length > 0,
  ][stepIndex];

  function goToStep(nextStepIndex: number) {
    setRefusal(null);
    setStepIndex(nextStepIndex);
  }

  async function handleAllot() {
    if (!selectedSalesman || !selectedRoute) return;
    setRefusal(null);
    try {
      await allotGatepassAsync({
        salesmanId: selectedSalesman.id,
        routeId: selectedRoute.id,
        businessDate: businessDateKey,
        items: reviewItems.map(({ item, issuedQty }) => ({ varietyId: item.varietyId, issuedQty })),
      });
      toast.success(tx("admin.gatepass.allot.success"));
      setAllottedGatepass({
        salesmanId: selectedSalesman.id,
        salesmanName: selectedSalesman.name,
        businessDate,
        routeName: selectedRoute.name,
        routeCode: selectedRoute.code,
        reviewItems,
      });
    } catch (error) {
      setRefusal(getErrorMessage(tx, error, tx("admin.gatepass.allot.failed")));
    }
  }

  function startAnotherAllotment() {
    setAllottedGatepass(null);
    setSelectedSalesmanId("");
    setSelectedRouteId("");
    setQuantitiesByVarietyId({});
    setStepIndex(0);
  }

  // The Admin shell signs the Admin in; this page sits in the header nav, so it has a back arrow
  // only when it was opened from a salesman.
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-4 sm:px-6">
      {preselectedSalesmanId ? (
        <BackHeader
          href={`/admin/salesman/${preselectedSalesmanId}`}
          title={tx("admin.gatepass.allot.title")}
        />
      ) : (
        <h1 className="text-base font-semibold">{tx("admin.gatepass.allot.title")}</h1>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6">
        {allottedGatepass ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-brand">
              <CheckCircle2Icon className="size-5 shrink-0" />
              <p className="font-semibold">
                {tx("admin.gatepass.allot.allottedTo", { name: allottedGatepass.salesmanName })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(allottedGatepass.businessDate, "d MMM yyyy")}
            </p>
            <RouteFixedCard
              routeName={allottedGatepass.routeName}
              routeCode={allottedGatepass.routeCode}
            />
            <div className="flex flex-col divide-y rounded-xl border">
              {allottedGatepass.reviewItems.map(({ item, issuedQty }) => (
                <div
                  key={item.varietyId}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    {item.productName}{" "}
                    <span className="text-muted-foreground">{item.varietyName}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{issuedQty}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={startAnotherAllotment}
              >
                {tx("admin.gatepass.allot.another")}
              </Button>
              <Button asChild variant="ghost" className="rounded-full">
                <Link href={`/admin/salesman/${allottedGatepass.salesmanId}`}>
                  {tx("admin.gatepass.allot.openSalesman")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ol className="grid grid-cols-4 gap-1.5">
              {STEP_LABEL_KEYS.map((labelKey, index) => (
                <li key={labelKey}>
                  <button
                    type="button"
                    disabled={index > stepIndex}
                    onClick={() => goToStep(index)}
                    className="flex w-full flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default"
                  >
                    <span
                      className={cn(
                        "h-1.5 rounded-full",
                        index <= stepIndex ? "bg-brand" : "bg-muted",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px] leading-tight sm:text-xs",
                        index === stepIndex ? "font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {index + 1}. {tx(labelKey)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            {stepIndex === 0 && (
              <>
                <AllotSalesmanStep
                  businessDate={businessDate}
                  onBusinessDateChange={setBusinessDate}
                  salesmen={salesmen}
                  isSalesmenLoading={isSalesmenListLoading}
                  dayGatepasses={dayGatepasses}
                  selectedSalesmanId={selectedSalesmanId}
                  onSelectSalesman={setSelectedSalesmanId}
                />
                {selectedSalesmanHasActiveGatepass && (
                  <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                    {tx("admin.gatepass.allot.activeBlocks")}
                  </p>
                )}
              </>
            )}
            {stepIndex === 1 && (
              <AllotRouteStep
                routeChoices={routeChoices}
                isRouteChoicesLoading={isRouteChoicesLoading}
                pricedCountByRouteId={pricedCountByRouteId}
                catalogVarietyCount={catalogItems.length}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            )}
            {stepIndex === 2 && selectedRoute && (
              <div className="flex flex-col gap-3">
                <RouteTag name={selectedRoute.name} code={selectedRoute.code} />
                <AllotQuantitiesStep
                  routeId={selectedRoute.id}
                  routeName={selectedRoute.name}
                  catalogItems={catalogItems}
                  // Until the Route's prices arrive every variety would look unpriced.
                  isCatalogLoading={isProductsListLoading || isRoutePricesLoading}
                  pricedVarietyIds={pricedVarietyIds}
                  quantitiesByVarietyId={quantitiesByVarietyId}
                  onQuantityChange={(varietyId, quantity) =>
                    setQuantitiesByVarietyId((currentQuantities) => ({
                      ...currentQuantities,
                      [varietyId]: quantity,
                    }))
                  }
                />
              </div>
            )}
            {stepIndex === 3 && selectedSalesman && selectedRoute && (
              <AllotReviewStep
                salesmanName={selectedSalesman.name}
                businessDate={businessDate}
                routeName={selectedRoute.name}
                routeCode={selectedRoute.code}
                reviewItems={reviewItems}
                refusal={refusal}
                isAllotting={isAllottingGatepass}
                onChangeRoute={() => goToStep(1)}
                onAllot={() => void handleAllot()}
              />
            )}

            {stepIndex < 3 && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  disabled={stepIndex === 0}
                  onClick={() => goToStep(stepIndex - 1)}
                >
                  <ChevronLeftIcon className="size-4" />
                  {tx("common.actions.back")}
                </Button>
                <Button
                  type="button"
                  disabled={!canGoNext}
                  onClick={() => goToStep(stepIndex + 1)}
                  className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {tx("common.pagination.next")}
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <GatepassDayList
        businessDate={businessDate}
        salesmen={salesmen}
        dayGatepasses={dayGatepasses}
        allotmentMatrix={allotmentMatrix}
        isLoading={isGatepassesLoading || isAllotmentMatrixLoading || isSalesmenListLoading}
      />
    </div>
  );
}

export default function GatepassPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-4 sm:px-6">
          <ListItemSkeleton count={5} />
        </div>
      }
    >
      <GatepassPageContent />
    </Suspense>
  );
}
