import { addDays, format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useCustomers } from "~/hooks/use-customers";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useOrders } from "~/hooks/use-orders";
import { useCart } from "~/providers/cart-provider";

export type OrderTypeChoice = "book_now" | "pre_order";

interface SelectedCustomer {
  id: string;
  shopName: string;
  phone: string;
}

interface NewCustomerFormValues {
  shopName: string;
  phone: string;
  address: string;
}

const EMPTY_NEW_CUSTOMER_FORM: NewCustomerFormValues = { shopName: "", phone: "", address: "" };
const CUSTOMER_SEARCH_PAGE_SIZE = 20;

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

export function useCheckoutWizard() {
  const router = useRouter();
  const { cartLines, totalCartQuantity, setQuantityForVariety, removeLine, clearCart } = useCart();

  const businessDateKey = format(new Date(), "yyyy-MM-dd");
  const nextDayDate = addDays(new Date(), 1);

  const [currentStepNumber, setCurrentStepNumber] = useState(1);
  const [orderType, setOrderType] = useState<OrderTypeChoice>("book_now");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerFormValues>(
    EMPTY_NEW_CUSTOMER_FORM,
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const debouncedCustomerSearchTerm = useDebouncedValue(customerSearchTerm, 350);

  const { myGatepass } = useGatepasses({ businessDate: businessDateKey, includeMyGatepass: true });

  const { customersPage, isCustomersListLoading, createCustomerAsync, isCreatingCustomer } =
    useCustomers({
      listFilters: {
        searchTerm: debouncedCustomerSearchTerm || undefined,
        page: 1,
        pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
      },
      enabled: currentStepNumber === 3,
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
    newCustomerForm.address.trim().length > 0;
  const isCustomerStepValid = Boolean(selectedCustomer) || isNewCustomerFormFilled;

  function selectExistingCustomer(customer: SelectedCustomer) {
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

  async function placeOrder() {
    let customerForOrder = selectedCustomer;

    if (!customerForOrder && isNewCustomerFormFilled) {
      try {
        const createdCustomerResponse = await createCustomerAsync({
          shopName: newCustomerForm.shopName.trim(),
          phone: newCustomerForm.phone.trim(),
          address: newCustomerForm.address.trim(),
        });
        customerForOrder = {
          id: createdCustomerResponse.data.id,
          shopName: createdCustomerResponse.data.shopName,
          phone: createdCustomerResponse.data.phone,
        };
        setSelectedCustomer(customerForOrder);
      } catch (createCustomerError) {
        const errorMessage =
          createCustomerError instanceof Error
            ? createCustomerError.message
            : "Could not save customer";
        toast.error(errorMessage);
        return;
      }
    }

    if (!customerForOrder) return;

    const items = cartLines.map((line) => ({ varietyId: line.varietyId, quantity: line.quantity }));

    try {
      if (orderType === "book_now") {
        await placeBookNowOrderAsync({
          customerId: customerForOrder.id,
          businessDate: businessDateKey,
          idempotencyKey,
          items,
        });
      } else {
        await placePreOrderAsync({
          customerId: customerForOrder.id,
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
  };
}
