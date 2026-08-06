"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { OrderDetailSheet } from "~/components/salesman/order-detail-sheet";
import { OrderListRow } from "~/components/salesman/order-list-row";
import { useOrders } from "~/hooks/use-orders";

const ORDERS_PAGE_SIZE = 20;
const PREORDERS_PAGE_SIZE = 100;

type PreorderStatusFilter = "pending" | "fulfilled";

export default function SalesmanOrdersPage() {
  const businessDateKey = format(new Date(), "yyyy-MM-dd");

  const [bookNowPage, setBookNowPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [preorderStatusFilter, setPreorderStatusFilter] = useState<PreorderStatusFilter>("pending");

  const { ordersPage: bookNowOrdersPage, isOrdersListLoading: isBookNowLoading } = useOrders({
    listFilters: { type: "book_now", page: bookNowPage, pageSize: ORDERS_PAGE_SIZE },
  });

  const { ordersPage: myPreordersPageData, isOrdersListLoading: isMyPreordersLoading } = useOrders({
    listFilters: { type: "pre_order", page: 1, pageSize: PREORDERS_PAGE_SIZE },
  });

  const { duePreorders, isDuePreordersLoading } = useOrders({
    duePreordersDate: businessDateKey,
  });

  const isPreordersLoading = isMyPreordersLoading || isDuePreordersLoading;

  const allPreorderRows = useMemo(() => {
    const rowsById = new Map<string, { order: (typeof duePreorders)[number]; customerShopName?: string }>();
    for (const order of duePreorders) rowsById.set(order.id, { order });
    for (const { order, customerShopName } of myPreordersPageData.items) {
      rowsById.set(order.id, { order, customerShopName });
    }
    return Array.from(rowsById.values());
  }, [duePreorders, myPreordersPageData.items]);

  const pendingPreorderRows = allPreorderRows.filter(({ order }) => order.status !== "fulfilled");
  const fulfilledPreorderRows = allPreorderRows.filter(({ order }) => order.status === "fulfilled");
  const visiblePreorderRows =
    preorderStatusFilter === "pending" ? pendingPreorderRows : fulfilledPreorderRows;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="book_now">
        <TabsList className="w-full">
          <TabsTrigger value="book_now" className="flex-1">
            Book Now
          </TabsTrigger>
          <TabsTrigger value="pre_order" className="flex-1">
            Pre-orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="book_now" className="flex flex-col gap-3">
          {isBookNowLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
          ) : bookNowOrdersPage.items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              You have not placed any Book Now orders yet.
            </p>
          ) : (
            bookNowOrdersPage.items.map(({ order, customerShopName }) => (
              <OrderListRow
                key={order.id}
                primaryLabel={customerShopName}
                orderCode={order.orderCode}
                timestampLabel={format(new Date(order.placedAt), "d MMM, h:mm a")}
                totalQuantity={order.totalQuantity}
                status={order.status}
                onClick={() => setSelectedOrderId(order.id)}
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
            <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
          ) : visiblePreorderRows.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {preorderStatusFilter === "pending"
                ? "No pre-orders are pending right now."
                : "No pre-orders have been fulfilled yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visiblePreorderRows.map(({ order, customerShopName }) => (
                <OrderListRow
                  key={order.id}
                  primaryLabel={customerShopName ?? order.orderCode}
                  orderCode={order.orderCode}
                  timestampLabel={format(
                    new Date(order.fulfilledAt ?? order.scheduledDate ?? order.placedAt),
                    "d MMM yyyy",
                  )}
                  totalQuantity={order.totalQuantity}
                  status={order.status}
                  onClick={() => setSelectedOrderId(order.id)}
                />
              ))}
            </div>
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
