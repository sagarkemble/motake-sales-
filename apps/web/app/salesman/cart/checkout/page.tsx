"use client";

import { addDays, format } from "date-fns";
import { AlertTriangleIcon, StoreIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CustomerPickerDrawer } from "~/components/salesman/customer-picker-drawer";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useCart } from "~/providers/cart-provider";
import { useCustomers } from "~/hooks/use-customers";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useOrders } from "~/hooks/use-orders";

type OrderTypeChoice = "book_now" | "pre_order";

interface SelectedCustomer {
  id: string;
  shopName: string;
  phone: string;
}

function getBookNowBlockReasons(
  cartLines: { productName: string; varietyName: string; varietyId: string; quantity: number }[],
  myGatepass: ReturnType<typeof useGatepasses>["myGatepass"],
): string[] {
  if (!myGatepass) return ["No gate pass has been given to you for today yet."];
  if (myGatepass.gatepass.status !== "active") {
    return [`Gate pass is not active (status: ${myGatepass.gatepass.status}).`];
  }

  const shortfalls: string[] = [];
  for (const line of cartLines) {
    const gatepassItem = myGatepass.items.find((item) => item.varietyId === line.varietyId);
    const availableQty = gatepassItem
      ? (gatepassItem.availableQty ?? gatepassItem.issuedQty - gatepassItem.soldQty)
      : 0;
    if (line.quantity > availableQty) {
      shortfalls.push(
        `${line.productName} (${line.varietyName}): need ${line.quantity}, gate pass has ${availableQty}`,
      );
    }
  }
  return shortfalls;
}

export default function SalesmanCheckoutPage() {
  const router = useRouter();
  const { cartLines, totalCartQuantity, clearCart } = useCart();

  const businessDateKey = format(new Date(), "yyyy-MM-dd");
  const nextDayDate = addDays(new Date(), 1);

  const [orderType, setOrderType] = useState<OrderTypeChoice>("book_now");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const { myGatepass } = useGatepasses({
    businessDate: businessDateKey,
    includeMyGatepass: true,
  });

  const { placeBookNowOrderAsync, isPlacingBookNowOrder, placePreOrderAsync, isPlacingPreOrder } =
    useOrders();

  const bookNowBlockReasons = useMemo(
    () => getBookNowBlockReasons(cartLines, myGatepass),
    [cartLines, myGatepass],
  );
  const isBookNowAllowed = bookNowBlockReasons.length === 0;
  const isPlacingOrder = isPlacingBookNowOrder || isPlacingPreOrder;
  const isChosenOrderTypeUsable = orderType === "pre_order" || isBookNowAllowed;

  async function handlePlaceOrder() {
    if (!selectedCustomer) return;

    const items = cartLines.map((line) => ({ varietyId: line.varietyId, quantity: line.quantity }));

    try {
      if (orderType === "book_now") {
        await placeBookNowOrderAsync({
          customerId: selectedCustomer.id,
          businessDate: businessDateKey,
          idempotencyKey,
          items,
        });
      } else {
        await placePreOrderAsync({
          customerId: selectedCustomer.id,
          scheduledDate: format(nextDayDate, "yyyy-MM-dd"),
          idempotencyKey,
          items,
        });
      }
      clearCart();
      toast.success("Order placed");
      router.push("/salesman/orders");
    } catch (placeOrderError) {
      const errorMessage =
        placeOrderError instanceof Error ? placeOrderError.message : "Could not place order";
      toast.error(errorMessage);
    }
  }

  if (cartLines.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
        <p className="py-16 text-center text-sm text-muted-foreground">
          Your cart is empty. Go to Products and tap Add to Cart.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-4">
      <p className="text-sm text-muted-foreground">
        {totalCartQuantity} {totalCartQuantity === 1 ? "item" : "items"} in cart
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Order type</p>

        <button
          type="button"
          disabled={!isBookNowAllowed}
          onClick={() => setOrderType("book_now")}
          className={cn(
            "flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors",
            orderType === "book_now" ? "border-brand bg-brand/5" : "border-border bg-card",
            !isBookNowAllowed && "opacity-50",
          )}
        >
          <p className="text-sm font-medium">Book Now</p>
          <p className="text-xs text-muted-foreground">Delivered today from your gate pass.</p>
          {!isBookNowAllowed && (
            <div className="mt-1 flex flex-col gap-0.5 rounded-lg bg-destructive/10 p-2">
              {bookNowBlockReasons.map((reason) => (
                <p key={reason} className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                  {reason}
                </p>
              ))}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOrderType("pre_order")}
          className={cn(
            "flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors",
            orderType === "pre_order" ? "border-brand bg-brand/5" : "border-border bg-card",
          )}
        >
          <p className="text-sm font-medium">Pre-order</p>
          <p className="text-xs text-muted-foreground">
            Scheduled for {format(nextDayDate, "d MMM yyyy")}. Does not use gate pass.
          </p>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Customer</p>
        <button
          type="button"
          onClick={() => setIsCustomerPickerOpen(true)}
          className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <StoreIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            {selectedCustomer ? (
              <>
                <p className="truncate text-sm font-medium">{selectedCustomer.shopName}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedCustomer.phone}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tap to choose a customer</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-brand">
            {selectedCustomer ? "Change" : "Choose"}
          </span>
        </button>
      </div>

      <Button
        type="button"
        disabled={!selectedCustomer || isPlacingOrder || !isChosenOrderTypeUsable}
        onClick={handlePlaceOrder}
        className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {isPlacingOrder ? "Placing order..." : "Place order"}
      </Button>

      <CustomerPickerDrawer
        open={isCustomerPickerOpen}
        onOpenChange={setIsCustomerPickerOpen}
        onSelectCustomer={(customer) =>
          setSelectedCustomer({ id: customer.id, shopName: customer.shopName, phone: customer.phone })
        }
      />
    </div>
  );
}
