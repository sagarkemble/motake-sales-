import type { RouterOutputs } from "@repo/trpc/client";
import { addDays, format } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useCustomers } from "~/hooks/use-customers";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import type { PreferredLanguage } from "~/lib/preferred-language";
import { useCart } from "~/providers/cart-provider";
import { trpc } from "~/trpc/client";

export type OrderTypeChoice = "book_now" | "pre_order";

export type CheckoutCustomer = Pick<
  RouterOutputs["customers"]["list"]["data"]["items"][number],
  "id" | "shopName" | "phone" | "address" | "shopPhotoUrl" | "routeName" | "routeCode"
>;

export interface NewCustomerFormValues {
  shopName: string;
  phone: string;
  address: string;
  shopPhotoKey: string;
  shopPhotoUrl: string;
  preferredLanguage: PreferredLanguage;
}

/** The Route a salesman works today: their Active GatePass Route, or none. */
export interface ActiveGatepassRoute {
  name: string;
  code: string;
}

export interface PlacedOrder {
  type: OrderTypeChoice;
  totalQuantity: number;
  placedAt: Date;
}

const EMPTY_NEW_CUSTOMER_FORM: NewCustomerFormValues = {
  shopName: "",
  phone: "",
  address: "",
  shopPhotoKey: "",
  shopPhotoUrl: "",
  preferredLanguage: "mr",
};
const CUSTOMER_SEARCH_PAGE_SIZE = 20;

function getBookNowBlockReasons(
  cartLines: { productName: string; varietyName: string; varietyId: string; quantity: number }[],
  myGatepass: ReturnType<typeof useGatepasses>["myGatepass"],
): string[] {
  if (!myGatepass) return ["salesman.checkout.gatepass.noneToday"];
  if (myGatepass.gatepass.status !== "active") {
    return [`Gate pass is not active (status: ${myGatepass.gatepass.status}).`];
  }

  const shortfalls: string[] = [];
  for (const line of cartLines) {
    const gatepassItem = myGatepass.items.find((item) => item.varietyId === line.varietyId);
    const sellableQty = gatepassItem?.sellableQty ?? 0;
    if (line.quantity > sellableQty) {
      shortfalls.push(
        `${line.productName} (${line.varietyName}): need ${line.quantity}, gate pass has ${sellableQty}`,
      );
    }
  }
  return shortfalls;
}

export function useCheckoutWizard() {
  const tx = useTranslate();
  const router = useRouter();
  const { cartLines, totalCartQuantity, setQuantityForVariety, removeLine, clearCart } = useCart();

  const businessDateKey = format(new Date(), "yyyy-MM-dd");
  const nextDayDate = addDays(new Date(), 1);

  const [currentStepNumber, setCurrentStepNumber] = useState(1);
  const [orderType, setOrderType] = useState<OrderTypeChoice>("book_now");
  const [selectedCustomer, setSelectedCustomer] = useState<CheckoutCustomer | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [newCustomerForm, setNewCustomerForm] =
    useState<NewCustomerFormValues>(EMPTY_NEW_CUSTOMER_FORM);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  const debouncedCustomerSearchTerm = useDebouncedValue(customerSearchTerm, 350);

  const { myGatepass, isMyGatepassLoading } = useGatepasses({
    businessDate: businessDateKey,
    includeMyGatepass: true,
  });
  // Customers come only from the Active GatePass Route; a handed-over or closed one is not Active.
  const activeGatepassRoute: ActiveGatepassRoute | null =
    myGatepass?.gatepass.status === "active"
      ? { name: myGatepass.gatepass.routeName, code: myGatepass.gatepass.routeCode }
      : null;

  // The salesman Customer list is keyed only by search, so it is refreshed whenever the Active
  // GatePass (and with it the Route) changes; otherwise the last Route's Customers would show.
  const utils = trpc.useUtils();
  const activeGatepassId = myGatepass?.gatepass.status === "active" ? myGatepass.gatepass.id : null;
  useEffect(() => {
    if (activeGatepassId) void utils.customers.invalidate();
  }, [activeGatepassId, utils]);

  const { customersPage, isCustomersListLoading, createCustomerAsync, isCreatingCustomer } =
    useCustomers({
      listFilters: {
        searchTerm: debouncedCustomerSearchTerm || undefined,
        page: 1,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
      },
      enabled: currentStepNumber === 3 && Boolean(activeGatepassRoute),
    });

  const { placeBookNowOrderAsync, isPlacingBookNowOrder, placePreOrderAsync, isPlacingPreOrder } =
    useOrders();

  const bookNowBlockReasons = useMemo(
    () => getBookNowBlockReasons(cartLines, myGatepass),
    [cartLines, myGatepass],
  );
  const isBookNowAllowed = bookNowBlockReasons.length === 0;
  const isPlacingOrder = isPlacingBookNowOrder || isPlacingPreOrder;

  const isNewCustomerFormFilled =
    newCustomerForm.shopName.trim().length > 0 &&
    newCustomerForm.phone.trim().length > 0 &&
    newCustomerForm.address.trim().length > 0 &&
    newCustomerForm.shopPhotoKey.trim().length > 0;
  const isCustomerStepValid =
    Boolean(activeGatepassRoute) && (Boolean(selectedCustomer) || isNewCustomerFormFilled);

  function selectExistingCustomer(customer: CheckoutCustomer) {
    setSelectedCustomer(customer);
    setNewCustomerForm(EMPTY_NEW_CUSTOMER_FORM);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
  }

  function updateNewCustomerForm(fieldValues: Partial<NewCustomerFormValues>) {
    setSelectedCustomer(null);
    setNewCustomerForm((currentValues) => ({ ...currentValues, ...fieldValues }));
  }

  function goToStep(stepNumber: number) {
    setCurrentStepNumber(stepNumber);
  }

  function goToNextStep() {
    setCurrentStepNumber((stepNumber) => Math.min(3, stepNumber + 1));
  }

  function goToPreviousStep() {
    setCurrentStepNumber((stepNumber) => Math.max(1, stepNumber - 1));
  }

  function goToOrdersList() {
    router.push("/salesman/orders");
  }

  function goToHome() {
    router.push("/salesman");
  }

  async function placeOrder() {
    let customerForOrder = selectedCustomer;

    if (!customerForOrder && isNewCustomerFormFilled) {
      try {
        const createdCustomerResponse = await createCustomerAsync({
          shopName: newCustomerForm.shopName.trim(),
          phone: newCustomerForm.phone.trim(),
          address: newCustomerForm.address.trim(),
          shopPhotoKey: newCustomerForm.shopPhotoKey,
          preferredLanguage: newCustomerForm.preferredLanguage,
        });
        customerForOrder = {
          id: createdCustomerResponse.data.id,
          shopName: createdCustomerResponse.data.shopName,
          phone: createdCustomerResponse.data.phone,
          address: createdCustomerResponse.data.address,
          shopPhotoUrl: createdCustomerResponse.data.shopPhotoUrl,
          routeName: activeGatepassRoute?.name ?? "",
          routeCode: activeGatepassRoute?.code ?? "",
        };
        setSelectedCustomer(customerForOrder);
      } catch (createCustomerError) {
        const errorMessage =
          createCustomerError instanceof Error
            ? createCustomerError.message
            : tx("salesman.checkout.error.saveCustomer");
        toast.error(errorMessage);
        return;
      }
    }

    if (!customerForOrder) return;

    const lines = cartLines.map((line) => ({ sku: line.sku, qty: line.quantity }));
    const placedQuantity = totalCartQuantity;

    try {
      // No Payment step yet (Spec F UI): Book Now takes ₹0, so the whole Bill stays Pending.
      if (orderType === "book_now") {
        await placeBookNowOrderAsync({
          customerId: customerForOrder.id,
          idempotencyKey,
          lines,
          payment: { mode: "cash", receivedPaise: 0 },
        });
      } else {
        await placePreOrderAsync({
          customerId: customerForOrder.id,
          scheduledDate: format(nextDayDate, "yyyy-MM-dd"),
          idempotencyKey,
          lines,
        });
      }
      clearCart();
      setPlacedOrder({
        type: orderType,
        totalQuantity: placedQuantity,
        placedAt: new Date(),
      });
    } catch (placeOrderError) {
      const errorMessage =
        placeOrderError instanceof Error
          ? placeOrderError.message
          : tx("salesman.checkout.error.placeOrder");
      toast.error(errorMessage);
    }
  }

  return {
    cartLines,
    totalCartQuantity,
    onCartQuantityChange: setQuantityForVariety,
    onCartLineRemove: removeLine,

    currentStepNumber,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    isCustomerStepValid,

    orderType,
    setOrderType,
    isBookNowAllowed,
    bookNowBlockReasons,
    nextDayDate,

    myGatepass,
    isMyGatepassLoading,
    activeGatepassRoute,
    customerSearchTerm,
    setCustomerSearchTerm,
    customersPage,
    isCustomersListLoading,
    selectedCustomer,
    selectExistingCustomer,
    clearSelectedCustomer,
    newCustomerForm,
    updateNewCustomerForm,
    isCreatingCustomer,

    isPlacingOrder,
    placeOrder,
    placedOrder,
    goToOrdersList,
    goToHome,
  };
}
