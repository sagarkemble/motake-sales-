import { businessDateOf, type RouterOutputs } from "@repo/trpc/client";
import { addDays, format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CheckoutSuccessInput } from "~/components/shared/checkout/checkout-success";
import { useCheckoutAttempt } from "~/hooks/shared/use-checkout-attempt";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useCustomers } from "~/hooks/use-customers";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import {
  EMPTY_PAYMENT_DRAFT,
  paymentMaths,
  paymentProblemKey,
  toCheckoutPaymentInput,
  type PaymentContext,
  type PaymentDraft,
} from "~/lib/checkout-payment";
import { checkoutRefusalOf, type CheckoutRefusalReason } from "~/lib/checkout-refusal";
import { getErrorMessage } from "~/lib/get-error-message";
import type { PreferredLanguage } from "~/lib/preferred-language";
import { useCart } from "~/providers/cart-provider";
import { trpc } from "~/trpc/client";

export type OrderTypeChoice = "book_now" | "pre_order";
export type CheckoutStep = "cart" | "type" | "customer" | "payment";

export type CheckoutCustomer = Pick<
  RouterOutputs["customers"]["list"]["data"]["items"][number],
  | "id"
  | "shopName"
  | "phone"
  | "address"
  | "shopPhotoUrl"
  | "routeName"
  | "routeCode"
  | "balancePaise"
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

/** Why Book Now is closed: a locale key and its values. */
export interface BookNowBlockReason {
  key: string;
  values?: Record<string, string | number>;
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
const CHECKOUT_ATTEMPT_ID = "checkout";

// Where the salesman goes to fix a refusal.
const REFUSAL_STEP: Partial<Record<CheckoutRefusalReason, CheckoutStep>> = {
  empty_basket: "cart",
  bad_lines: "cart",
  short_stock: "cart",
  bill_total_zero: "cart",
  idempotency_key_reused: "cart",
  scheduled_date_not_after_today: "type",
  customer_inactive: "customer",
  customer_not_on_route: "customer",
  overpay_choice_required: "payment",
  return_change_cash_only: "payment",
  balance_changed: "payment",
};

export function useCheckoutWizard() {
  const tx = useTranslate();
  const router = useRouter();
  const { cartLines, totalCartQuantity, setQuantityForVariety, removeLine, clearCart } = useCart();

  const businessDateKey = businessDateOf(new Date());
  const tomorrowDateKey = format(addDays(parseISO(businessDateKey), 1), "yyyy-MM-dd");

  const [currentStep, setCurrentStep] = useState<CheckoutStep>("cart");
  const [orderType, setOrderType] = useState<OrderTypeChoice>("book_now");
  const [scheduledDate, setScheduledDate] = useState(tomorrowDateKey);
  const [selectedCustomer, setSelectedCustomer] = useState<CheckoutCustomer | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [newCustomerForm, setNewCustomerForm] =
    useState<NewCustomerFormValues>(EMPTY_NEW_CUSTOMER_FORM);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const [result, setResult] = useState<CheckoutSuccessInput | null>(null);
  const attempt = useCheckoutAttempt(CHECKOUT_ATTEMPT_ID);

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
      enabled: currentStep === "customer" && Boolean(activeGatepassRoute),
    });

  const quoteLines = useMemo(
    () => cartLines.map((line) => ({ sku: line.sku, qty: line.quantity })),
    [cartLines],
  );

  // The server quotes the basket as a Book Now so short lines show; with a Customer it adds the
  // Balance and what clears Pending after this Bill.
  const {
    quote,
    isQuoteLoading,
    isQuoteFetching,
    quoteError,
    refetchQuote,
    placeBookNowOrderAsync,
    isPlacingBookNowOrder,
    placePreOrderAsync,
    isPlacingPreOrder,
  } = useOrders({
    quoteInput: {
      lines: quoteLines,
      orderType: "book_now",
      customerId: selectedCustomer?.id,
    },
    enabled: cartLines.length > 0 && !result,
  });
  const quoteRefusal = quoteError ? checkoutRefusalOf(quoteError) : null;

  const bookNowBlockReasons = useMemo<BookNowBlockReason[]>(() => {
    if (!myGatepass) return [{ key: "salesman.checkout.gatepass.noneToday" }];
    if (myGatepass.gatepass.status !== "active") {
      return [
        {
          key: "salesman.checkout.orderType.gatepassNotActive",
          values: { route: myGatepass.gatepass.routeName },
        },
      ];
    }
    return (quote?.shortLines ?? []).map((shortLine) => ({
      key: "salesman.checkout.orderType.shortLine",
      values: { name: shortLine.name, need: shortLine.needQty, left: shortLine.leftQty },
    }));
  }, [myGatepass, quote?.shortLines]);
  const isBookNowAllowed = bookNowBlockReasons.length === 0;

  // Book Now goes Cart → Type → Customer → Payment; a Pre-order takes no Payment.
  const steps: CheckoutStep[] =
    orderType === "book_now"
      ? ["cart", "type", "customer", "payment"]
      : ["cart", "type", "customer"];
  const currentStepIndex = Math.max(0, steps.indexOf(currentStep));
  const isLastStep = currentStepIndex === steps.length - 1;

  const isNewCustomerFormFilled =
    newCustomerForm.shopName.trim().length > 0 &&
    newCustomerForm.phone.trim().length > 0 &&
    newCustomerForm.address.trim().length > 0 &&
    newCustomerForm.shopPhotoKey.trim().length > 0;
  const isCustomerStepValid =
    Boolean(activeGatepassRoute) && (Boolean(selectedCustomer) || isNewCustomerFormFilled);

  const isCartBlocked =
    cartLines.length === 0 || !quote || Boolean(quoteError) || quote.badLines.length > 0;

  const paymentContext: PaymentContext | null =
    quote && selectedCustomer
      ? {
          billTotalPaise: quote.totals.totalPaise,
          balanceBeforePaise: quote.balance?.balancePaise ?? 0,
        }
      : null;

  // The locale key of what blocks the primary button on this step, or null.
  const stepProblemKey: string | null =
    currentStep === "cart"
      ? isCartBlocked && !isQuoteLoading
        ? "salesman.checkout.problem.fixCart"
        : null
      : currentStep === "type"
        ? orderType === "book_now" && !isBookNowAllowed
          ? "salesman.checkout.problem.bookNowClosed"
          : null
        : currentStep === "customer"
          ? !isCustomerStepValid
            ? "salesman.checkout.problem.pickCustomer"
            : null
          : !paymentContext
            ? null
            : paymentProblemKey(paymentContext, paymentDraft);

  const isPlacingOrder = isPlacingBookNowOrder || isPlacingPreOrder;
  const isNextDisabled =
    Boolean(stepProblemKey) ||
    (currentStep === "cart" && (isQuoteLoading || isCartBlocked)) ||
    (currentStep === "payment" && (!paymentContext || isQuoteFetching));

  function selectExistingCustomer(customer: CheckoutCustomer) {
    setSelectedCustomer(customer);
    setNewCustomerForm(EMPTY_NEW_CUSTOMER_FORM);
    setPaymentDraft(EMPTY_PAYMENT_DRAFT);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
    setPaymentDraft(EMPTY_PAYMENT_DRAFT);
  }

  function updateNewCustomerForm(fieldValues: Partial<NewCustomerFormValues>) {
    setSelectedCustomer(null);
    setNewCustomerForm((currentValues) => ({ ...currentValues, ...fieldValues }));
  }

  function changeOrderType(nextOrderType: OrderTypeChoice) {
    setOrderType(nextOrderType);
    attempt.clearRefusal();
  }

  function goToPreviousStep() {
    setCurrentStep(steps[Math.max(0, currentStepIndex - 1)] ?? "cart");
  }

  function goToOrdersList() {
    router.push("/salesman/orders");
  }

  function goToHome() {
    router.push("/salesman");
  }

  // A new Customer is saved when the salesman leaves the Customer step, so the Payment step can
  // quote their Balance.
  async function ensureCustomer(): Promise<CheckoutCustomer | null> {
    if (selectedCustomer) return selectedCustomer;
    if (!isNewCustomerFormFilled) return null;
    try {
      const createdCustomerResponse = await createCustomerAsync({
        shopName: newCustomerForm.shopName.trim(),
        phone: newCustomerForm.phone.trim(),
        address: newCustomerForm.address.trim(),
        shopPhotoKey: newCustomerForm.shopPhotoKey,
        preferredLanguage: newCustomerForm.preferredLanguage,
      });
      const createdCustomer: CheckoutCustomer = {
        id: createdCustomerResponse.data.id,
        shopName: createdCustomerResponse.data.shopName,
        phone: createdCustomerResponse.data.phone,
        address: createdCustomerResponse.data.address,
        shopPhotoUrl: createdCustomerResponse.data.shopPhotoUrl,
        routeName: activeGatepassRoute?.name ?? "",
        routeCode: activeGatepassRoute?.code ?? "",
        balancePaise: 0,
      };
      setSelectedCustomer(createdCustomer);
      setNewCustomerForm(EMPTY_NEW_CUSTOMER_FORM);
      return createdCustomer;
    } catch (createCustomerError) {
      toast.error(getErrorMessage(createCustomerError, tx("salesman.checkout.error.saveCustomer")));
      return null;
    }
  }

  async function placeBookNow(customer: CheckoutCustomer, context: PaymentContext) {
    const previewReturnedPaise = paymentMaths(context, paymentDraft).preview.returnedPaise;
    const billed = await attempt.run(
      async (idempotencyKey) =>
        (
          await placeBookNowOrderAsync({
            customerId: customer.id,
            idempotencyKey,
            lines: quoteLines,
            payment: toCheckoutPaymentInput(context, paymentDraft),
          })
        ).data,
      { paymentContext: context, fallbackErrorKey: "salesman.checkout.error.placeOrder" },
    );
    if (!billed) return;
    clearCart();
    setResult({
      kind: "billed",
      headingKey: "checkout.success.billed",
      shopName: customer.shopName,
      mode: paymentDraft.mode,
      result: billed,
      previewReturnedPaise,
    });
  }

  async function placePreOrder(customer: CheckoutCustomer) {
    const placedQuantity = totalCartQuantity;
    const booked = await attempt.run(
      async (idempotencyKey) =>
        (
          await placePreOrderAsync({
            customerId: customer.id,
            scheduledDate,
            idempotencyKey,
            lines: quoteLines,
          })
        ).data,
      { paymentContext: null, fallbackErrorKey: "salesman.checkout.error.placeOrder" },
    );
    if (!booked) return;
    clearCart();
    setResult({
      kind: "preorder",
      shopName: customer.shopName,
      totalQuantity: placedQuantity,
      result: booked,
    });
  }

  async function goToNextStep() {
    attempt.clearRefusal();
    if (currentStep === "customer") {
      const customer = await ensureCustomer();
      if (!customer) return;
      if (orderType === "pre_order") {
        await placePreOrder(customer);
        return;
      }
    }
    if (currentStep === "payment") {
      if (selectedCustomer && paymentContext) await placeBookNow(selectedCustomer, paymentContext);
      return;
    }
    setCurrentStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)] ?? "cart");
  }

  // balance_changed: place again against the Balance the server found, under a new key.
  async function placeAgainWithNewAmounts() {
    const change = attempt.balanceChange;
    if (!change || !selectedCustomer) return;
    await placeBookNow(selectedCustomer, {
      ...change.wasContext,
      balanceBeforePaise: change.nowBalancePaise,
    });
    void refetchQuote();
  }

  function changePaymentAfterBalanceChange() {
    attempt.clearBalanceChange();
    void refetchQuote();
  }

  function handleRefusalAction() {
    const refusal = attempt.refusal;
    if (!refusal) return;
    attempt.clearRefusal();
    if (refusal.reason === "no_active_gatepass") {
      router.push("/salesman/gatepass");
      return;
    }
    if (refusal.reason === "customer_inactive" || refusal.reason === "customer_not_on_route") {
      clearSelectedCustomer();
    }
    const targetStep = REFUSAL_STEP[refusal.reason];
    if (targetStep && steps.includes(targetStep)) setCurrentStep(targetStep);
  }

  return {
    cartLines,
    totalCartQuantity,
    onCartQuantityChange: setQuantityForVariety,
    onCartLineRemove: removeLine,

    steps,
    currentStep,
    currentStepIndex,
    isLastStep,
    goToNextStep,
    goToPreviousStep,
    stepProblemKey,
    isNextDisabled,

    quote,
    isQuoteLoading,
    quoteRefusal,
    quoteError,
    refetchQuote,

    orderType,
    setOrderType: changeOrderType,
    isBookNowAllowed,
    bookNowBlockReasons,
    scheduledDate,
    setScheduledDate,
    tomorrowDateKey,

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

    paymentContext,
    paymentDraft,
    setPaymentDraft,

    isPlacingOrder,
    refusal: attempt.refusal,
    clearRefusal: attempt.clearRefusal,
    handleRefusalAction,
    balanceChange: attempt.balanceChange,
    placeAgainWithNewAmounts,
    changePaymentAfterBalanceChange,
    result,
    goToOrdersList,
    goToHome,
  };
}
