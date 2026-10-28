"use client";

import { ClipboardListIcon } from "lucide-react";

import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

type OrderStatus = "confirmed" | "scheduled" | "due" | "fulfilled" | "cancelled";

interface OrderListRowProps {
  primaryLabel: string;
  shopPhotoUrl?: string | null;
  timestampLabel: string;
  routeName?: string;
  /** Unknown for a bare due Pre-order that another salesman placed. */
  totalQuantity?: number;
  bill: { number: string; totalPaise: number } | null;
  status: OrderStatus;
  onClick: () => void;
}

export function OrderListRow({
  primaryLabel,
  shopPhotoUrl,
  timestampLabel,
  routeName,
  totalQuantity,
  bill,
  status,
  onClick,
}: OrderListRowProps) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const isCancelled = status === "cancelled";
  const metaParts = [
    timestampLabel,
    routeName,
    totalQuantity === undefined ? undefined : tx("salesman.orders.qty", { count: totalQuantity }),
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-card p-3 text-left outline-none transition-[color,background-color,box-shadow] hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-muted/40",
        isCancelled && "opacity-70",
      )}
    >
      {shopPhotoUrl !== undefined ? (
        <ShopPhotoThumbnail shopPhotoUrl={shopPhotoUrl} shopName={primaryLabel} size="md" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
          <ClipboardListIcon className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{primaryLabel}</p>
        <p className="truncate text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
        <OrderStatusBadge status={status} className="mt-1" />
      </div>

      <div className="min-w-0 shrink-0 text-right">
        {bill ? (
          <>
            <p
              className={cn(
                "whitespace-nowrap text-sm font-semibold tabular-nums",
                isCancelled ? "text-muted-foreground line-through" : "text-brand",
              )}
            >
              {formatPaise(bill.totalPaise)}
            </p>
            <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {bill.number}
            </p>
          </>
        ) : (
          <p className="whitespace-nowrap text-xs text-muted-foreground">
            {tx(isCancelled ? "salesman.orders.row.noBill" : "salesman.orders.row.noBillYet")}
          </p>
        )}
      </div>
    </button>
  );
}
