"use client";

import { useMemo, useState } from "react";

import type { RouterOutputs } from "@repo/trpc/client";

import { isPreorderPending } from "~/lib/is-preorder-pending";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { OrderDetailSheet } from "~/components/salesman/order-detail-sheet";
import { OrderListRow } from "~/components/salesman/order-list-row";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";

const ORDERS_PAGE_SIZE = 20;
const PREORDERS_PAGE_SIZE = 20;

type PreorderStatusFilter = "pending" | "fulfilled";

type ListedOrder = RouterOutputs["orders"]["list"]["data"]["items"][number];
type DuePreorder = RouterOutputs["orders"]["listRoutePreorders"]["data"][number];

/** A row from this salesman's list, or a bare due Pre-order from the due list. */
type PreorderRow = { kind: "listed"; row: ListedOrder } | { kind: "bare"; order: DuePreorder };

function preorderRowStatus(preorderRow: PreorderRow) {
  return preorderRow.kind === "listed" ? preorderRow.row.status : preorderRow.order.status;
}

export default function SalesmanOrdersPage() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { canonicalBusinessDate } = useGatepasses();

  const [bookNowPage, setBookNowPage] = useState(1);
  const [preorderPage, setPreorderPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [preorderStatusFilter, setPreorderStatusFilter] = useState<PreorderStatusFilter>("pending");

  const { ordersPage: bookNowOrdersPage, isOrdersListLoading: isBookNowLoading } = useOrders({
    listFilters: { type: "book_now", page: bookNowPage, pageSize: ORDERS_PAGE_SIZE },
  });

  const { ordersPage: myPreordersPageData, isOrdersListLoading: isMyPreordersLoading } = useOrders({
    listFilters: { type: "pre_order", page: preorderPage, pageSize: PREORDERS_PAGE_SIZE },
  });

  const { duePreorders, isDuePreordersLoading } = useOrders({
    routePreorders: Boolean(canonicalBusinessDate),
  });

  const isPreordersLoading = isMyPreordersLoading || isDuePreordersLoading;

  // The due list returns bare orders from every salesman; this salesman's own rows replace
  // them so shop, Route, quantity and Bill show where the list has them.
  const allPreorderRows = useMemo(() => {
    const rowsById = new Map<string, PreorderRow>();
    for (const order of duePreorders) rowsById.set(order.id, { kind: "bare", order });
    for (const row of myPreordersPageData.items) rowsById.set(row.id, { kind: "listed", row });
    return Array.from(rowsById.values());
  }, [duePreorders, myPreordersPageData.items]);

  const pendingPreorderRows = allPreorderRows.filter((preorderRow) =>
    isPreorderPending(preorderRowStatus(preorderRow)),
  );
  const fulfilledPreorderRows = allPreorderRows.filter(
    (preorderRow) => preorderRowStatus(preorderRow) === "fulfilled",
  );
  const visiblePreorderRows =
    preorderStatusFilter === "pending" ? pendingPreorderRows : fulfilledPreorderRows;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
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
          {isBookNowLoading ? (
            <ListItemSkeleton count={5} />
          ) : bookNowOrdersPage.items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tx("salesman.orders.empty.orders")}
            </p>
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

          {bookNowOrdersPage.totalPages > 1 && (
            <PaginationFooter
              page={bookNowOrdersPage.page}
              totalPages={bookNowOrdersPage.totalPages}
              onPageChange={setBookNowPage}
            />
          )}
        </TabsContent>

        <TabsContent value="pre_order" className="flex flex-col gap-4">
          <div className="inline-flex w-fit gap-1 rounded-full border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setPreorderStatusFilter("pending")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                preorderStatusFilter === "pending"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Pending ({pendingPreorderRows.length})
            </button>
            <button
              type="button"
              onClick={() => setPreorderStatusFilter("fulfilled")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                preorderStatusFilter === "fulfilled"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              Fulfilled ({fulfilledPreorderRows.length})
            </button>
          </div>

          {isPreordersLoading ? (
            <ListItemSkeleton count={5} />
          ) : visiblePreorderRows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {preorderStatusFilter === "pending"
                ? tx("salesman.orders.empty.preOrdersPending")
                : tx("salesman.orders.empty.preOrdersFulfilled")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visiblePreorderRows.map((preorderRow) =>
                preorderRow.kind === "listed" ? (
                  <OrderListRow
                    key={preorderRow.row.id}
                    primaryLabel={preorderRow.row.customerShopName}
                    shopPhotoUrl={preorderRow.row.customerShopPhotoUrl}
                    timestampLabel={formatDate(
                      new Date(
                        preorderRow.row.fulfilledAt ??
                          preorderRow.row.scheduledDate ??
                          preorderRow.row.placedAt,
                      ),
                      "d MMM yyyy",
                    )}
                    routeName={preorderRow.row.routeName}
                    totalQuantity={preorderRow.row.totalQuantity}
                    bill={preorderRow.row.bill}
                    status={preorderRow.row.status}
                    onClick={() => setSelectedOrderId(preorderRow.row.id)}
                  />
                ) : (
                  <OrderListRow
                    key={preorderRow.order.id}
                    primaryLabel={tx("common.orderType.preOrder")}
                    timestampLabel={formatDate(
                      new Date(preorderRow.order.scheduledDate ?? preorderRow.order.placedAt),
                      "d MMM yyyy",
                    )}
                    bill={null}
                    status={preorderRow.order.status}
                    onClick={() => setSelectedOrderId(preorderRow.order.id)}
                  />
                ),
              )}
            </div>
          )}

          {myPreordersPageData.totalPages > 1 && (
            <PaginationFooter
              page={myPreordersPageData.page}
              totalPages={myPreordersPageData.totalPages}
              onPageChange={setPreorderPage}
            />
          )}
        </TabsContent>
      </Tabs>

      <OrderDetailSheet
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}

interface PaginationFooterProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function PaginationFooter({ page, totalPages, onPageChange }: PaginationFooterProps) {
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
