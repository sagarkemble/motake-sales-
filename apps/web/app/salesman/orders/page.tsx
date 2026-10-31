"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import type { RouterOutputs } from "@repo/trpc/client";

import { isPreorderPending } from "~/lib/is-preorder-pending";
import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { OrderDetailSheet } from "~/components/salesman/order-detail-sheet";
import { OrderListRow } from "~/components/salesman/order-list-row";
import { RoutePreordersSection } from "~/components/salesman/orders/route-preorders-section";
import { useFormatDate } from "~/hooks/use-format-date";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

const ORDERS_PAGE_SIZE = 20;
const PREORDERS_PAGE_SIZE = 20;

type PreorderStatusFilter = "pending" | "fulfilled";

type ListedOrder = RouterOutputs["orders"]["list"]["data"]["items"][number];

function SalesmanOrdersContent() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [bookNowPage, setBookNowPage] = useState(1);
  const [preorderPage, setPreorderPage] = useState(1);
  // ?order=<id> (after checkout) opens that order's sheet.
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(searchParams.get("order"));
  const [preorderStatusFilter, setPreorderStatusFilter] = useState<PreorderStatusFilter>("pending");

  const {
    ordersPage: bookNowOrdersPage,
    isOrdersListLoading: isBookNowLoading,
    refetchOrdersList: refetchBookNow,
    isOrdersListFetching: isBookNowFetching,
  } = useOrders({
    listFilters: { type: "book_now", page: bookNowPage, pageSize: ORDERS_PAGE_SIZE },
  });

  const {
    ordersPage: myPreordersPageData,
    isOrdersListLoading: isMyPreordersLoading,
    refetchOrdersList: refetchMyPreorders,
    isOrdersListFetching: isMyPreordersFetching,
  } = useOrders({
    listFilters: { type: "pre_order", page: preorderPage, pageSize: PREORDERS_PAGE_SIZE },
  });
  usePageRefresh(
    () => Promise.all([refetchBookNow(), refetchMyPreorders()]),
    isBookNowFetching || isMyPreordersFetching,
  );
  const isReloading = usePageReloading();

  // Pre-orders on the Route from every salesman are in the Route Pre-orders section above;
  // this tab lists this salesman's own.
  const myPreorderRows: ListedOrder[] = myPreordersPageData.items;
  const pendingPreorderRows = myPreorderRows.filter((row) => isPreorderPending(row.status));
  const fulfilledPreorderRows = myPreorderRows.filter((row) => row.status === "fulfilled");
  const visiblePreorderRows =
    preorderStatusFilter === "pending" ? pendingPreorderRows : fulfilledPreorderRows;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <RoutePreordersSection />

      <Tabs defaultValue="book_now">
        <TabsList className="w-full">
          <TabsTrigger value="book_now" className="flex-1">
            {tx("salesman.orders.tab.orders")}
          </TabsTrigger>
          <TabsTrigger value="pre_order" className="flex-1">
            {tx("salesman.orders.tab.preOrders")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="book_now" className="flex flex-col gap-3">
          {isBookNowLoading || (isReloading && isBookNowFetching) ? (
            <ListItemSkeleton count={5} />
          ) : bookNowOrdersPage.items.length === 0 ? (
            <EmptyStateCard
              title={tx("empty.salesmanOrders.title")}
              body={tx("empty.salesmanOrders.body")}
              action={{ label: tx("empty.actions.goToProducts"), href: "/salesman" }}
            />
          ) : (
            bookNowOrdersPage.items.map((row) => (
              <OrderListRow
                key={row.id}
                primaryLabel={row.customerShopName}
                shopPhotoUrl={row.customerShopPhotoUrl}
                timestampLabel={formatDate(new Date(row.placedAt), "d MMM, h:mm a")}
                routeName={row.routeName}
                totalQuantity={row.totalQuantity}
                bill={row.bill}
                status={row.status}
                onClick={() => setSelectedOrderId(row.id)}
              />
            ))
          )}

          <ListPager
            page={bookNowOrdersPage.page}
            totalPages={bookNowOrdersPage.totalPages}
            onPageChange={setBookNowPage}
          />
        </TabsContent>

        <TabsContent value="pre_order" className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={preorderStatusFilter}
            onValueChange={(value) =>
              value && setPreorderStatusFilter(value as PreorderStatusFilter)
            }
            className="w-full sm:w-fit"
          >
            <ToggleGroupItem
              value="pending"
              className="flex-1 px-4 data-[state=on]:bg-accent data-[state=on]:text-brand"
            >
              {tx("salesman.orders.filter.pending", { count: pendingPreorderRows.length })}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="fulfilled"
              className="flex-1 px-4 data-[state=on]:bg-accent data-[state=on]:text-brand"
            >
              {tx("salesman.orders.filter.fulfilled", { count: fulfilledPreorderRows.length })}
            </ToggleGroupItem>
          </ToggleGroup>

          {isMyPreordersLoading || (isReloading && isMyPreordersFetching) ? (
            <ListItemSkeleton count={5} />
          ) : visiblePreorderRows.length === 0 ? (
            <EmptyStateCard
              title={
                preorderStatusFilter === "pending"
                  ? tx("empty.preordersPending.title")
                  : tx("empty.preordersFulfilled.title")
              }
              body={
                preorderStatusFilter === "pending"
                  ? tx("empty.preordersPending.body")
                  : tx("empty.preordersFulfilled.body")
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {visiblePreorderRows.map((row) => (
                <OrderListRow
                  key={row.id}
                  primaryLabel={row.customerShopName}
                  shopPhotoUrl={row.customerShopPhotoUrl}
                  timestampLabel={formatDate(
                    new Date(row.fulfilledAt ?? row.scheduledDate ?? row.placedAt),
                    "d MMM yyyy",
                  )}
                  routeName={row.routeName}
                  totalQuantity={row.totalQuantity}
                  bill={row.bill}
                  status={row.status}
                  onClick={() => setSelectedOrderId(row.id)}
                />
              ))}
            </div>
          )}

          <ListPager
            page={myPreordersPageData.page}
            totalPages={myPreordersPageData.totalPages}
            onPageChange={setPreorderPage}
          />
        </TabsContent>
      </Tabs>

      <OrderDetailSheet
        orderId={selectedOrderId}
        onOpenChange={(open) => {
          if (open) return;
          setSelectedOrderId(null);
          // Closing drops ?order, so a reload does not open it again.
          if (searchParams.has("order")) router.replace(pathname, { scroll: false });
        }}
      />
    </div>
  );
}

export default function SalesmanOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3 px-4 py-4">
          <ListItemSkeleton count={4} />
        </div>
      }
    >
      <SalesmanOrdersContent />
    </Suspense>
  );
}
