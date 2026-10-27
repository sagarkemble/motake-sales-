"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import {
  ALL,
  CustomerFilterSelect,
  FilterField,
  SalesmanFilterSelect,
  orUndefined,
} from "~/components/admin/orders/filter-fields";
import {
  FulfilPreOrderSheet,
  FulfilRowButton,
  isFulfilDue,
  isOpenPreorder,
} from "~/components/admin/orders/fulfil-pre-order-sheet";
import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { SalesmanLabel } from "~/components/admin/orders/salesman-label";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { OrderItemAvatars } from "~/components/shared/order-item-avatars";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

type OrderListRow = RouterOutputs["orders"]["list"]["data"]["items"][number];
type OrderType = OrderListRow["type"];
type OrderStatus = OrderListRow["status"];

const ORDER_STATUSES: OrderStatus[] = ["confirmed", "scheduled", "due", "fulfilled", "cancelled"];
const ORDER_TYPE_LABEL_KEYS: Record<OrderType, string> = {
  book_now: "common.orderType.bookNow",
  pre_order: "common.orderType.preOrder",
};

interface OrderFilters {
  salesmanId: string;
  customerId: string;
  type: string;
  status: string;
  customerPhone: string;
  placedFrom: string;
  placedTo: string;
}

const EMPTY_FILTERS: OrderFilters = {
  salesmanId: ALL,
  customerId: ALL,
  type: ALL,
  status: ALL,
  customerPhone: "",
  placedFrom: "",
  placedTo: "",
};

function countActive(filters: OrderFilters) {
  return Object.entries(filters).filter(
    ([key, value]) => value !== EMPTY_FILTERS[key as keyof OrderFilters],
  ).length;
}

// Placed dates are picked as IST business days.
function istDayStart(businessDate: string) {
  return businessDate ? new Date(`${businessDate}T00:00:00+05:30`) : undefined;
}
function istDayEnd(businessDate: string) {
  return businessDate ? new Date(`${businessDate}T23:59:59.999+05:30`) : undefined;
}

interface OrderListProps {
  /** Fixes the list to one Customer and hides the filter panel (Customer page). */
  customerId?: string;
}

export function OrderList({ customerId }: OrderListProps) {
  const tx = useTranslate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  // A snapshot, not an id: after fulfil (or a refusal) the list refetches and a Status filter may
  // drop the row, but the sheet must stay to show the success or the refusal.
  const [fulfilRow, setFulfilRow] = useState<OrderListRow | null>(null);
  const debouncedPhone = useDebouncedValue(filters.customerPhone.trim(), 350);
  const pageSize = 20;
  const showFilters = !customerId;

  const { ordersPage, isOrdersListLoading } = useOrders({
    listFilters: {
      customerId: customerId ?? orUndefined(filters.customerId),
      salesmanId: orUndefined(filters.salesmanId),
      type: orUndefined(filters.type) as OrderType | undefined,
      status: orUndefined(filters.status) as OrderStatus | undefined,
      customerPhone: debouncedPhone || undefined,
      placedFrom: istDayStart(filters.placedFrom),
      placedTo: istDayEnd(filters.placedTo),
      page,
      pageSize,
    },
  });

  function setFilter<K extends keyof OrderFilters>(key: K, value: OrderFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const activeCount = countActive(filters);

  // An open Pre-order opens the Fulfil sheet; any other order opens its detail.
  function openRow(row: OrderListRow) {
    if (isOpenPreorder(row)) setFulfilRow(row);
    else setSelectedOrderId(row.id);
  }

  return (
    <div className="flex flex-col gap-3">
      {showFilters && (
        <details className="rounded-2xl border bg-card p-3" open>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <SlidersHorizontalIcon className="size-4" />
            {tx("admin.orders.filters.title")}
            {activeCount > 0 && (
              <span className="rounded-full bg-brand/10 px-2 text-xs text-brand">
                {activeCount}
              </span>
            )}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {tx("admin.orders.filters.count", { count: ordersPage.totalCount })}
            </span>
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <FilterField label={tx("admin.orders.salesman")}>
              <SalesmanFilterSelect
                value={filters.salesmanId}
                onValueChange={(value) => setFilter("salesmanId", value)}
              />
            </FilterField>
            <FilterField label={tx("admin.bills.customer")}>
              <CustomerFilterSelect
                value={filters.customerId}
                onValueChange={(value) => setFilter("customerId", value)}
              />
            </FilterField>
            <FilterField label={tx("admin.orders.filters.type")}>
              <Select value={filters.type} onValueChange={(value) => setFilter("type", value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{tx("admin.orders.filters.anyType")}</SelectItem>
                  {Object.entries(ORDER_TYPE_LABEL_KEYS).map(([type, labelKey]) => (
                    <SelectItem key={type} value={type}>
                      {tx(labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={tx("admin.orders.filters.status")}>
              <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{tx("admin.orders.filters.anyStatus")}</SelectItem>
                  {ORDER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {tx(`common.orderStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={tx("admin.orders.filters.customerPhone")}>
              <Input
                inputMode="tel"
                placeholder="98220…"
                value={filters.customerPhone}
                onChange={(event) => setFilter("customerPhone", event.target.value)}
              />
            </FilterField>
            <FilterField label={tx("admin.orders.filters.placedFrom")}>
              <Input
                type="date"
                value={filters.placedFrom}
                onChange={(event) => setFilter("placedFrom", event.target.value)}
              />
            </FilterField>
            <FilterField label={tx("admin.orders.filters.placedTo")}>
              <Input
                type="date"
                value={filters.placedTo}
                onChange={(event) => setFilter("placedTo", event.target.value)}
              />
            </FilterField>
          </div>
        </details>
      )}

      {isOrdersListLoading ? (
        <ListItemSkeleton count={5} />
      ) : ordersPage.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          {activeCount > 0 ? tx("admin.orders.filters.noMatch") : tx("admin.orders.empty")}
        </p>
      ) : (
        <>
          <OrderTable rows={ordersPage.items} onSelect={openRow} />
          <div className="flex flex-col gap-2 md:hidden">
            {ordersPage.items.map((row) => (
              <OrderCard key={row.id} row={row} onSelect={openRow} />
            ))}
          </div>
        </>
      )}

      <ListPager page={ordersPage.page} totalPages={ordersPage.totalPages} onPageChange={setPage} />

      <OrderDetailDialog
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />

      {fulfilRow && (
        <FulfilPreOrderSheet
          key={fulfilRow.id}
          row={fulfilRow}
          onClose={() => setFulfilRow(null)}
          onViewDetails={() => {
            setSelectedOrderId(fulfilRow.id);
            setFulfilRow(null);
          }}
        />
      )}
    </div>
  );
}

function OrderTypeBadge({ type }: { type: OrderType }) {
  const tx = useTranslate();
  return (
    <Badge variant="outline" className="border-transparent bg-muted text-foreground">
      {tx(ORDER_TYPE_LABEL_KEYS[type])}
    </Badge>
  );
}

function BillCell({ row, onFulfil }: { row: OrderListRow; onFulfil?: () => void }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  if (isOpenPreorder(row)) {
    if (onFulfil) return <FulfilRowButton row={row} onFulfil={onFulfil} />;
    // Inside a tappable card: the card opens the Fulfil sheet.
    return (
      <span className="text-xs font-medium text-brand">
        {isFulfilDue(row.scheduledDate)
          ? tx("admin.orders.fulfil.button")
          : tx("admin.orders.fulfil.fromDate", {
              date: formatDate(row.scheduledDate ?? "", "d MMM"),
            })}
      </span>
    );
  }
  if (!row.bill) {
    return <span className="text-xs text-muted-foreground">{tx("admin.orders.noBillShort")}</span>;
  }
  const cancelled = row.status === "cancelled";
  return (
    <div className="flex flex-col items-end">
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          cancelled ? "text-muted-foreground line-through" : "text-brand",
        )}
      >
        {formatPaise(row.bill.totalPaise)}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{row.bill.number}</span>
    </div>
  );
}

function PlacedCell({ row }: { row: OrderListRow }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  return (
    <div className="text-xs">
      <p>{formatDate(row.placedAt, "d MMM yyyy, h:mm a")}</p>
      {row.type === "pre_order" && row.scheduledDate && (
        <p className="text-muted-foreground">
          {tx("admin.orders.forDate", { date: formatDate(row.scheduledDate, "d MMM yyyy") })}
        </p>
      )}
    </div>
  );
}

function OrderTable({
  rows,
  onSelect,
}: {
  rows: OrderListRow[];
  onSelect: (row: OrderListRow) => void;
}) {
  const tx = useTranslate();

  return (
    <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tx("admin.bills.customer")}</TableHead>
            <TableHead>{tx("common.orderType.order")}</TableHead>
            <TableHead>{tx("admin.orders.route")}</TableHead>
            <TableHead>{tx("admin.orders.salesman")}</TableHead>
            <TableHead className="text-right">{tx("common.units.qty")}</TableHead>
            <TableHead>{tx("admin.orders.placedFor")}</TableHead>
            <TableHead className="text-right">{tx("admin.orders.bill")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} onClick={() => onSelect(row)} className="cursor-pointer">
              <TableCell>
                <div className="flex items-center gap-2">
                  <ShopPhotoThumbnail
                    shopPhotoUrl={row.customerShopPhotoUrl}
                    shopName={row.customerShopName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.customerShopName}</p>
                    <p className="text-xs text-muted-foreground">{row.customerPhone}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <OrderTypeBadge type={row.type} />
                  <OrderStatusBadge status={row.status} />
                </div>
              </TableCell>
              <TableCell>
                <p>{row.routeName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{row.routeCode}</p>
              </TableCell>
              <TableCell>
                <SalesmanLabel salesmanCode={row.salesmanCode} salesmanName={row.salesmanName} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <OrderItemAvatars itemPreviews={row.itemPreviews} size="sm" />
                  <span className="font-semibold tabular-nums">{row.totalQuantity}</span>
                </div>
              </TableCell>
              <TableCell>
                <PlacedCell row={row} />
              </TableCell>
              <TableCell className="text-right">
                <BillCell row={row} onFulfil={() => onSelect(row)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrderCard({
  row,
  onSelect,
}: {
  row: OrderListRow;
  onSelect: (row: OrderListRow) => void;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <OrderItemAvatars itemPreviews={row.itemPreviews} />
          <OrderTypeBadge type={row.type} />
        </div>
        <OrderStatusBadge status={row.status} className="shrink-0" />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ShopPhotoThumbnail
            shopPhotoUrl={row.customerShopPhotoUrl}
            shopName={row.customerShopName}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm">{row.customerShopName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.customerPhone} · {row.routeName}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <BillCell row={row} />
          <p className="text-xs font-bold text-muted-foreground">
            {row.totalQuantity} {tx("common.units.qty")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          <SalesmanLabel salesmanCode={row.salesmanCode} salesmanName={row.salesmanName} />
        </span>
        <span className="shrink-0">
          {row.type === "pre_order" && row.scheduledDate
            ? tx("admin.orders.forDate", { date: formatDate(row.scheduledDate, "d MMM yyyy") })
            : formatDate(row.placedAt, "d MMM yyyy")}
        </span>
      </div>
    </button>
  );
}
