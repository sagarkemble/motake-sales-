import { ClipboardListIcon } from "lucide-react";

import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { formatInrCompact } from "~/lib/format-money";

type OrderStatus = "confirmed" | "scheduled" | "due" | "fulfilled" | "cancelled";

interface OrderListRowProps {
  primaryLabel: string;
  orderCode: string;
  timestampLabel: string;
  totalQuantity: number;
  totalAmount: number;
  status: OrderStatus;
  onClick: () => void;
}

export function OrderListRow({
  primaryLabel,
  orderCode,
  timestampLabel,
  totalQuantity,
  totalAmount,
  status,
  onClick,
}: OrderListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors active:bg-muted/40"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
        <ClipboardListIcon className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{primaryLabel}</p>
        <p className="truncate text-xs text-muted-foreground">
          {orderCode} · {timestampLabel} · {totalQuantity} items
        </p>
        <p className="text-xs font-semibold text-brand">{formatInrCompact(totalAmount)}</p>
      </div>

      <OrderStatusBadge status={status} className="shrink-0" />
    </button>
  );
}
