import { db } from "@repo/database";
import { getProfileById } from "@repo/database/queries/auth";
import { getBillByOrderId } from "@repo/database/queries/bills";
import { getCustomerById, lockCustomerRow } from "@repo/database/queries/customers";
import {
  incrementSoldQtyIfAvailable,
  listGatepassItemsByGatepassId,
  lockGatepassItemsForVarieties,
} from "@repo/database/queries/gatepass";
import { getBalanceThroughBillDebit } from "@repo/database/queries/ledger";
import {
  countOrdersPlacedInRange,
  getLatestOrderVersion,
  getOrderByIdempotencyKey,
  getOrderCountsPerSalesmanInRange,
  getOrderDetailById,
  getOrderWithItemsById,
  insertOrder,
  insertOrderItems,
  insertOrderVersion,
  listOpenPreordersOnRoute,
  listOrderItemsByOrderId,
  listOrders,
  lockOrderRow,
  updateOrder,
  type OrderCountBySalesman,
  type OrderDetail,
  type OrderItem,
  type OrderListRow,
  type OrderWithItems,
} from "@repo/database/queries/orders";
import { getCheckoutPaymentForBill } from "@repo/database/queries/payments";
import { listSellableVarietiesBySkus } from "@repo/database/queries/products";
import { getRouteById } from "@repo/database/queries/routes";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import { listVarietyLabelsByIds } from "@repo/database/queries/variety-tax-periods";
import type { SelectCustomer, SelectOrder } from "@repo/database/schema";

import BillService, { type IssueBillInput } from "../bills";
import DocumentNumberService from "../document-numbers";
import { badRequest, checkoutRefusal, internalError, notFound, screenRefusal } from "../errors";
import GatepassService from "../gatepass";
import LedgerService from "../ledger";
import PaymentService, { splitPayment } from "../payments";
import type { CheckoutPaymentInput } from "../payments/model";
import RouteService from "../routes";
import SettingsService from "../settings";
import {
  assertCustomerActive,
  assertCustomerOnRoute,
  billTotalZeroRefusal,
  noActiveGatepassRefusal,
} from "../shared/checkout";
import {
  noCheckoutListener,
  notifyAfterCommit,
  dueStateOf,
  routeStampFromHeader,
  routeStampOf,
  type CheckoutListener,
  type CheckoutOutcome,
  type RouteStamp,
} from "../shared/checkout-events";
import { financialYearOf, financialYearOfInstant } from "../shared/financial-year";
import { MAX_QTY } from "../shared/limits";
import { computeBillTax, placeOfSupplyOf, type BillTax } from "../shared/tax-engine";
import VarietyTaxPeriodService from "../variety-tax-periods";
import {
  CHECKOUT_LINE_KEYS,
  fulfilActorSchema,
  fulfilPreOrderInputSchema,
  listOrdersInputSchema,
  placeBookNowInputSchema,
  placePreOrderInputSchema,
  quoteInputSchema,
  type BadLine,
  type BilledCheckoutResult,
  type CheckoutActor,
  type CheckoutLineInput,
  type FulfilActor,
  type FulfilPreOrderInput,
  type ListOrdersInput,
  type PlaceBookNowInput,
  type PlacePreOrderInput,
  type PreorderDueState,
  type PreOrderResult,
  type Quote,
  type QuoteInput,
  type QuoteLine,
  type QuoteTotals,
  type RoutePreorder,
  type ShortLine,
} from "./model";

const orderIdempotencyConstraint = "orders_idempotency_key_unique";
const paymentIdempotencyConstraint = "payments_idempotency_key_unique";

// A line is capped at MAX_QTY; the basket stays inside the int4 columns (bills.total_quantity),
// and Route price × qty with GST (under 100%) on top must stay a safe integer in paise.
const MAX_INT4 = 2_147_483_647;
const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

interface ParsedCheckoutPayment {
  mode: CheckoutPaymentInput["mode"];
  receivedPaise: number;
  reference: string | null;
  overpay?: CheckoutPaymentInput["overpay"];
}

// One merged basket line with the Route price and the covering tax facts it will lock.
interface ResolvedLine {
  sku: string;
  varietyId: string;
  name: string;
  unit: string;
  quantity: number;
  routePricePaise: number;
  exempt: boolean;
  gstRateBps: number;
  hsn: string;
}

interface ResolvedBasket {
  lines: ResolvedLine[];
  badLines: BadLine[];
}

// A transaction either did the work or found that a first attempt with the same key already had.
type CheckoutRun<Result> =
  | { kind: "done"; result: Result; outcome: CheckoutOutcome }
  | { kind: "replay"; order: SelectOrder };

// The checkout Payment key `{key}:pay` already belongs to another checkout (a fulfil key reused on
// another Pre-order, or a Book Now and a fulfil sharing a key): refused, nothing written.
function keyReusedOr(caughtError: unknown): unknown {
  if (violatedUniqueConstraint(caughtError) !== paymentIdempotencyConstraint) return caughtError;
  return checkoutRefusal(
    "idempotency_key_reused",
    "This checkout key was already used for another sale. Try again.",
  );
}

// A phone-supplied price, tax or amount on a line is refused by name.
function assertOnlySkuAndQty(lines: CheckoutLineInput[]): void {
  const allowedKeys = new Set<string>(CHECKOUT_LINE_KEYS);
  const refused = lines.flatMap((line) =>
    Object.keys(line)
      .filter((key) => !allowedKeys.has(key))
      .map((field) => ({ sku: line.sku, field })),
  );
  if (refused.length > 0) {
    throw checkoutRefusal(
      "price_field_refused",
      "A line takes only SKU and qty; prices and tax come from the Route.",
      { fields: refused },
    );
  }
}

function assertBasketNotEmpty(lines: CheckoutLineInput[]): void {
  if (lines.length === 0) throw checkoutRefusal("empty_basket", "The basket is empty.");
}

function assertNoBadLines(badLines: BadLine[]): void {
  if (badLines.length > 0) {
    throw checkoutRefusal("bad_lines", "Some lines cannot be sold. Remove or fix them.", {
      lines: badLines,
    });
  }
}

function shortLinesOf(lines: ResolvedLine[], leftByVarietyId: Map<string, number>): ShortLine[] {
  return lines
    .map((line) => ({
      sku: line.sku,
      name: line.name,
      needQty: line.quantity,
      leftQty: leftByVarietyId.get(line.varietyId) ?? 0,
    }))
    .filter((line) => line.needQty > line.leftQty);
}

function totalsOf(tax: BillTax<ResolvedLine>): QuoteTotals {
  return {
    taxablePaise: tax.taxablePaise,
    cgstPaise: tax.cgstPaise,
    sgstPaise: tax.sgstPaise,
    igstPaise: tax.igstPaise,
    grossPaise: tax.grossPaise,
    roundOffPaise: tax.roundOffPaise,
    totalPaise: tax.totalPaise,
    totalQuantity: tax.totalQuantity,
    legalType: tax.legalType,
  };
}

function wrongRouteRefusal(order: SelectOrder, gatepassRouteId: string) {
  return checkoutRefusal(
    "wrong_route",
    "This Pre-order is on another Route than your Active GatePass.",
    {
      preOrderRouteId: order.routeId,
      gatepassRouteId,
    },
  );
}

function toBillLines(items: OrderItem[]): IssueBillInput["lines"] {
  return items.map((item) => ({
    varietyId: item.varietyId,
    orderItemId: item.id,
    stamp: item.stamp,
    quantity: item.quantity,
    routePricePaise: item.routePricePaise,
    exempt: item.exempt,
    gstRateBps: item.gstRateBps,
  }));
}

// Checkout (Spec F): Book Now, Pre-order place and fulfil, and the quote the cart shows. Lock
// order everywhere: order row, GatePass, GatePass lines (by variety id), number series (MB then
// MP), Customer.
class OrderService {
  private readonly billService = new BillService();
  private readonly documentNumbers = new DocumentNumberService();
  private readonly gatepassService = new GatepassService();
  private readonly ledgerService = new LedgerService();
  private readonly paymentService = new PaymentService();
  private readonly routeService = new RouteService();
  private readonly settingsService = new SettingsService();
  private readonly varietyTaxPeriodService = new VarietyTaxPeriodService();

  // Spec J's listener, called once after a Book Now or fulfil commits.
  public constructor(private readonly afterCommit: CheckoutListener = noCheckoutListener) {}

  // Sold on the spot from the Active GatePass: locks Route price and tax, deducts stock, issues
  // the Bill, debits the Ledger and takes an optional checkout Payment, in one transaction.
  public async placeBookNow(
    actorSalesmanId: string,
    input: PlaceBookNowInput,
  ): Promise<BilledCheckoutResult> {
    const parsedInput = placeBookNowInputSchema.parse(input);
    assertOnlySkuAndQty(parsedInput.lines);
    const firstOrder = await getOrderByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstOrder) return this.billedResultOf(firstOrder, parsedInput.payment);
    assertBasketNotEmpty(parsedInput.lines);

    const run = await this.runCheckout<BilledCheckoutResult>(
      parsedInput.idempotencyKey,
      async (transaction) => {
        const now = new Date();
        const activeGatepass = await this.gatepassService.lockActiveGatepassForSalesman(
          actorSalesmanId,
          "update",
          transaction,
        );
        if (!activeGatepass) throw noActiveGatepassRefusal();
        // A retry that waited on the GatePass lock behind its first attempt.
        const winner = await getOrderByIdempotencyKey(parsedInput.idempotencyKey, transaction);
        if (winner) return { kind: "replay", order: winner };
        const { gatepass, route } = activeGatepass;

        const customer = await getCustomerById(parsedInput.customerId, transaction);
        assertCustomerOnRoute(customer, parsedInput.customerId, route.id);
        const basket = await this.resolveBasket(
          parsedInput.lines,
          route.id,
          businessDateOf(now),
          transaction,
        );
        assertNoBadLines(basket.badLines);
        const gatepassItemIds = await this.lockStock(gatepass.id, basket.lines, transaction);

        const seller = await this.settingsService.requireSellerSettings(transaction);
        const tax = computeBillTax(
          basket.lines,
          placeOfSupplyOf(route.deliveryState, seller.state),
        );
        if (tax.totalPaise === 0) throw billTotalZeroRefusal();
        const routeStamp = routeStampOf(route);

        return this.billAndCollect(
          {
            actorId: actorSalesmanId,
            customer,
            routeId: route.id,
            routeStamp,
            billTotalPaise: tax.totalPaise,
            payment: parsedInput.payment,
            idempotencyKey: parsedInput.idempotencyKey,
            gatepassId: gatepass.id,
            now,
            writeOrder: async () => {
              const order = await insertOrder(
                {
                  type: "book_now",
                  status: "confirmed",
                  salesmanId: actorSalesmanId,
                  customerId: parsedInput.customerId,
                  routeId: route.id,
                  gatepassId: gatepass.id,
                  placedAt: now,
                  idempotencyKey: parsedInput.idempotencyKey,
                  notes: parsedInput.notes,
                },
                transaction,
              );
              const items = await this.writeSaleLines(
                order,
                basket.lines,
                routeStamp,
                actorSalesmanId,
                transaction,
              );
              for (const line of basket.lines) {
                const deducted = await incrementSoldQtyIfAvailable(
                  gatepassItemIds.get(line.varietyId)!,
                  line.quantity,
                  transaction,
                );
                if (!deducted) {
                  throw screenRefusal(
                    "stock_changed",
                    `GatePass stock moved under lock: ${line.sku}`,
                  );
                }
              }
              return { orderId: order.id, items };
            },
          },
          transaction,
        );
      },
    );

    if (run.kind === "replay") return this.billedResultOf(run.order, parsedInput.payment);
    await notifyAfterCommit(this.afterCommit, run.outcome);
    return run.result;
  }

  // For a later date at today's Route price and tax classification. No Bill, number, Ledger,
  // stock or Payment; nothing is sent.
  public async placePreOrder(
    actorSalesmanId: string,
    input: PlacePreOrderInput,
  ): Promise<PreOrderResult> {
    const parsedInput = placePreOrderInputSchema.parse(input);
    assertOnlySkuAndQty(parsedInput.lines);
    const firstOrder = await getOrderByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstOrder) return this.preOrderResultOf(firstOrder);
    assertBasketNotEmpty(parsedInput.lines);
    const today = businessDateOf(new Date());
    if (parsedInput.scheduledDate < today) {
      throw checkoutRefusal(
        "scheduled_date_in_past",
        "A Pre-order date cannot be before today.",
        { scheduledDate: parsedInput.scheduledDate, today },
      );
    }

    const run = await this.runCheckout<PreOrderResult>(
      parsedInput.idempotencyKey,
      async (transaction) => {
        const now = new Date();
        const activeGatepass = await this.gatepassService.lockActiveGatepassForSalesman(
          actorSalesmanId,
          "share",
          transaction,
        );
        if (!activeGatepass) throw noActiveGatepassRefusal();
        const { route } = activeGatepass;

        const customer = await getCustomerById(parsedInput.customerId, transaction);
        assertCustomerOnRoute(customer, parsedInput.customerId, route.id);
        const basket = await this.resolveBasket(
          parsedInput.lines,
          route.id,
          businessDateOf(now),
          transaction,
        );
        assertNoBadLines(basket.badLines);

        const seller = await this.settingsService.requireSellerSettings(transaction);
        const tax = computeBillTax(
          basket.lines,
          placeOfSupplyOf(route.deliveryState, seller.state),
        );
        // It could never be fulfilled.
        if (tax.totalPaise === 0) throw billTotalZeroRefusal();

        const lockedCustomer = await lockCustomerRow(parsedInput.customerId, "share", transaction);
        assertCustomerOnRoute(lockedCustomer, parsedInput.customerId, route.id);

        const order = await insertOrder(
          {
            type: "pre_order",
            status: "scheduled",
            salesmanId: actorSalesmanId,
            customerId: parsedInput.customerId,
            routeId: route.id,
            gatepassId: null,
            scheduledDate: parsedInput.scheduledDate,
            placedAt: now,
            idempotencyKey: parsedInput.idempotencyKey,
            notes: parsedInput.notes,
          },
          transaction,
        );
        await this.writeSaleLines(
          order,
          basket.lines,
          routeStampOf(route),
          actorSalesmanId,
          transaction,
        );
        return {
          kind: "done",
          result: {
            orderId: order.id,
            scheduledDate: parsedInput.scheduledDate,
            indicativeTotalPaise: tax.totalPaise,
            balancePaise: lockedCustomer.balancePaise,
          },
          outcome: { bill: null, payment: null },
        };
      },
    );

    // Place sends nothing, so there is no after-commit call.
    return run.kind === "replay" ? this.preOrderResultOf(run.order) : run.result;
  }

  // On or after the scheduled date, by a salesman whose Active GatePass is on the Pre-order's
  // Route, or by Admin with no GatePass. Bills the locked sale terms (no re-price, no re-tax, no
  // stock) with the Route stamp copied at place. First writer wins.
  public async fulfilPreOrder(
    actor: FulfilActor,
    input: FulfilPreOrderInput,
  ): Promise<BilledCheckoutResult> {
    const parsedActor = fulfilActorSchema.parse(actor);
    const parsedInput = fulfilPreOrderInputSchema.parse(input);

    const run = await runInTransaction(
      async (transaction): Promise<CheckoutRun<BilledCheckoutResult>> => {
        const now = new Date();
        const today = businessDateOf(now);
        const order = await lockOrderRow(parsedInput.orderId, transaction);
        if (!order) throw notFound(`Order ${parsedInput.orderId} not found`);
        if (order.type !== "pre_order") {
          throw checkoutRefusal("not_a_pre_order", "Only a Pre-order can be fulfilled.", {
            orderId: order.id,
          });
        }
        if (order.status === "cancelled") {
          throw checkoutRefusal("pre_order_cancelled", "This Pre-order was cancelled.", {
            orderId: order.id,
          });
        }
        if (order.status === "fulfilled") {
          if (order.fulfilledBy === parsedActor.profileId) return { kind: "replay", order };
          throw await this.alreadyFulfilledRefusal(order, transaction);
        }
        const scheduledDate = order.scheduledDate ?? today;
        if (scheduledDate > today) {
          throw checkoutRefusal(
            "fulfil_too_early",
            `This Pre-order is for ${scheduledDate} and cannot be fulfilled before then.`,
            { scheduledDate },
          );
        }

        let gatepassId: string | null = null;
        if (parsedActor.role === "salesman") {
          const activeGatepass = await this.gatepassService.lockActiveGatepassForSalesman(
            parsedActor.profileId,
            "share",
            transaction,
          );
          if (!activeGatepass) throw noActiveGatepassRefusal();
          if (activeGatepass.route.id !== order.routeId)
            throw wrongRouteRefusal(order, activeGatepass.route.id);
          gatepassId = activeGatepass.gatepass.id;
        }

        const items = await listOrderItemsByOrderId(order.id, transaction);
        const latestVersion = await getLatestOrderVersion(order.id, transaction);
        if (!latestVersion) throw internalError(`Order ${order.id} has no version`);
        const routeStamp = routeStampFromHeader(latestVersion.header);
        const seller = await this.settingsService.requireSellerSettings(transaction);
        const tax = computeBillTax(items, placeOfSupplyOf(routeStamp.delivery_state, seller.state));
        if (tax.totalPaise === 0) throw billTotalZeroRefusal();

        const customer = await getCustomerById(order.customerId, transaction);
        assertCustomerOnRoute(customer, order.customerId, order.routeId);

        return this.billAndCollect(
          {
            actorId: parsedActor.profileId,
            customer,
            routeId: order.routeId,
            routeStamp,
            billTotalPaise: tax.totalPaise,
            payment: parsedInput.payment,
            idempotencyKey: parsedInput.idempotencyKey,
            gatepassId,
            now,
            writeOrder: async () => {
              const fulfilled = await updateOrder(
                order.id,
                {
                  status: "fulfilled",
                  fulfilledAt: now,
                  fulfilledBy: parsedActor.profileId,
                  gatepassId,
                },
                transaction,
              );
              await insertOrderVersion(
                {
                  orderId: order.id,
                  versionNumber: latestVersion.versionNumber + 1,
                  header: { ...fulfilled, route: routeStamp },
                  items,
                  reason: "Fulfilled",
                  actorId: parsedActor.profileId,
                },
                transaction,
              );
              return { orderId: order.id, items };
            },
          },
          transaction,
        );
      },
    ).catch((fulfilError: unknown) => {
      throw keyReusedOr(fulfilError);
    });

    if (run.kind === "replay") return this.billedResultOf(run.order, parsedInput.payment);
    await notifyAfterCommit(this.afterCommit, run.outcome);
    return run.result;
  }

  // What the Bill would be, from the server's Route price and tax, with every unsellable and
  // short line listed. No writes.
  public async quote(actor: CheckoutActor, input: QuoteInput): Promise<Quote> {
    const parsedActor = fulfilActorSchema.parse(actor);
    const parsedInput = quoteInputSchema.parse(input);
    assertOnlySkuAndQty(parsedInput.lines);
    const today = businessDateOf(new Date());

    let routeStamp: RouteStamp;
    let customer: SelectCustomer | undefined;
    let basket: ResolvedBasket;
    let shortLines: ShortLine[] = [];

    if (parsedInput.orderId) {
      // A Pre-order fulfil: its locked terms and Route stamp.
      const orderWithItems = await getOrderWithItemsById(parsedInput.orderId);
      if (!orderWithItems) throw notFound(`Order ${parsedInput.orderId} not found`);
      const { order, items } = orderWithItems;
      if (order.type !== "pre_order") {
        throw checkoutRefusal("not_a_pre_order", "Only a Pre-order can be fulfilled.", {
          orderId: order.id,
        });
      }
      if (parsedActor.role === "salesman") {
        const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(
          parsedActor.profileId,
        );
        if (!activeGatepass) throw noActiveGatepassRefusal();
        if (activeGatepass.route.id !== order.routeId)
          throw wrongRouteRefusal(order, activeGatepass.route.id);
      }
      const latestVersion = await getLatestOrderVersion(order.id);
      if (!latestVersion) throw internalError(`Order ${order.id} has no version`);
      routeStamp = routeStampFromHeader(latestVersion.header);
      customer = await getCustomerById(order.customerId);
      basket = { lines: await this.lockedTermsOf(items), badLines: [] };
    } else if (parsedActor.role === "salesman") {
      const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(
        parsedActor.profileId,
      );
      if (!activeGatepass) throw noActiveGatepassRefusal();
      routeStamp = routeStampOf(activeGatepass.route);
      if (parsedInput.customerId) {
        customer = await getCustomerById(parsedInput.customerId);
        assertCustomerOnRoute(customer, parsedInput.customerId, activeGatepass.route.id);
      }
      basket = await this.resolveBasket(parsedInput.lines, activeGatepass.route.id, today);
      if (parsedInput.orderType === "book_now") {
        const gatepassItems = await listGatepassItemsByGatepassId(activeGatepass.gatepass.id);
        shortLines = shortLinesOf(
          basket.lines,
          new Map(gatepassItems.map((item) => [item.varietyId, item.sellableQty])),
        );
      }
    } else {
      // Admin quotes on the Customer's current Route.
      if (!parsedInput.customerId) throw badRequest("Pick a Customer to quote for");
      customer = await getCustomerById(parsedInput.customerId);
      if (!customer) throw notFound(`Customer ${parsedInput.customerId} not found`);
      const route = await getRouteById(customer.routeId);
      if (!route) throw notFound(`Route ${customer.routeId} not found`);
      routeStamp = routeStampOf(route);
      basket = await this.resolveBasket(parsedInput.lines, route.id, today);
    }

    const seller = await this.settingsService.requireSellerSettings();
    const tax = computeBillTax(
      basket.lines,
      placeOfSupplyOf(routeStamp.delivery_state, seller.state),
    );
    // Only to start a checkout, which a deactivated Customer cannot have.
    if (customer) assertCustomerActive(customer, customer.id);
    const balance = customer ? await this.ledgerService.getBalance(customer.id) : null;
    const billsNow = Boolean(parsedInput.orderId) || parsedInput.orderType === "book_now";
    return {
      lines: tax.lines.map(
        (line): QuoteLine => ({
          sku: line.sku,
          varietyId: line.varietyId,
          name: line.name,
          unit: line.unit,
          qty: line.quantity,
          routePricePaise: line.routePricePaise,
          hsn: line.hsn,
          exempt: line.exempt,
          gstRateBps: line.gstRateBps,
          taxablePaise: line.taxablePaise,
          cgstPaise: line.cgstPaise,
          sgstPaise: line.sgstPaise,
          igstPaise: line.igstPaise,
        }),
      ),
      totals: totalsOf(tax),
      badLines: basket.badLines,
      shortLines,
      balance,
      requiredToClearPaise:
        balance && billsNow ? Math.max(0, balance.balancePaise + tax.totalPaise) : null,
    };
  }

  // Open Pre-orders on the Active GatePass Route, from any salesman, with upcoming / due /
  // overdue derived from today (Asia/Kolkata). Upcoming ones are read-only in the app.
  public async listRoutePreorders(actorSalesmanId: string): Promise<RoutePreorder[]> {
    const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(actorSalesmanId);
    if (!activeGatepass) throw noActiveGatepassRefusal();
    const today = businessDateOf(new Date());
    const rows = await listOpenPreordersOnRoute(activeGatepass.route.id);
    return rows.map((row) => ({ ...row, dueState: dueStateOf(row.scheduledDate, today) }));
  }

  public async getOrderWithItems(orderId: string): Promise<OrderWithItems | undefined> {
    return getOrderWithItemsById(orderId);
  }

  public async getOrderDetail(orderId: string): Promise<OrderDetail> {
    const orderDetail = await getOrderDetailById(orderId);
    if (!orderDetail) {
      throw notFound(`Order ${orderId} not found`);
    }
    return orderDetail;
  }

  public async listOrders(input: ListOrdersInput): Promise<PaginatedResult<OrderListRow>> {
    const parsedInput = listOrdersInputSchema.parse(input);
    return listOrders(parsedInput, parsedInput);
  }

  public async countOrdersPlacedInRange(
    filters: { salesmanId?: string; type?: SelectOrder["type"] },
    range: { from: Date; to: Date },
  ): Promise<number> {
    return countOrdersPlacedInRange(filters, range);
  }

  public async getOrderCountsPerSalesman(range: {
    from: Date;
    to: Date;
  }): Promise<OrderCountBySalesman[]> {
    return getOrderCountsPerSalesmanInRange(range);
  }

  // Runs a place in one transaction; a unique-key race with a concurrent first attempt rolls
  // back and returns that winner instead.
  private async runCheckout<Result>(
    idempotencyKey: string,
    work: (transaction: DbExecutor) => Promise<CheckoutRun<Result>>,
  ): Promise<CheckoutRun<Result>> {
    try {
      return await runInTransaction(work);
    } catch (checkoutError) {
      if (violatedUniqueConstraint(checkoutError) === orderIdempotencyConstraint) {
        const winner = await getOrderByIdempotencyKey(idempotencyKey);
        if (winner) return { kind: "replay", order: winner };
      }
      throw keyReusedOr(checkoutError);
    }
  }

  // Book Now and fulfil, once the sale is checked: decide the checkout Payment from the unlocked
  // Balance, allocate MB then MP, lock the Customer and re-check, then write the order, issue the
  // Bill and post the Payment (Bill debit first, Payment credit 1 ms later). The Bill date and the
  // numbers' FYs come from `now`; the Ledger time is read once the Customer lock is held, so it
  // follows every posting that committed while this call waited.
  private async billAndCollect(
    params: {
      actorId: string;
      customer: SelectCustomer;
      routeId: string;
      routeStamp: RouteStamp;
      billTotalPaise: number;
      payment: ParsedCheckoutPayment;
      idempotencyKey: string;
      gatepassId: string | null;
      now: Date;
      writeOrder: () => Promise<{ orderId: string; items: OrderItem[] }>;
    },
    transaction: DbExecutor,
  ): Promise<CheckoutRun<BilledCheckoutResult>> {
    const { actorId, customer, payment, now } = params;
    const splitFor = (balancePaise: number) =>
      splitPayment({
        mode: payment.mode,
        receivedPaise: payment.receivedPaise,
        overpay: payment.overpay,
        requiredPaise: balancePaise + params.billTotalPaise,
      });
    const keptBeforeLock = splitFor(customer.balancePaise).keptPaise;

    const billDate = businessDateOf(now);
    const billNumber = await this.documentNumbers.allocate(
      { kind: "bill", financialYear: financialYearOf(billDate), actorId },
      transaction,
    );
    const paymentNumber =
      keptBeforeLock > 0
        ? await this.documentNumbers.allocate(
            {
              kind: "payment",
              financialYear: financialYearOfInstant(new Date(now.getTime() + 1)),
              actorId,
            },
            transaction,
          )
        : null;

    const lockedCustomer = await lockCustomerRow(customer.id, "update", transaction);
    const billOccurredAt = new Date();
    const paymentOccurredAt = new Date(billOccurredAt.getTime() + 1);
    assertCustomerOnRoute(lockedCustomer, customer.id, params.routeId);
    const split = splitFor(lockedCustomer.balancePaise);
    if (split.keptPaise > 0 !== (paymentNumber !== null)) {
      throw checkoutRefusal(
        "balance_changed",
        "The Customer's Balance changed while placing. Check the amount and try again.",
        { balancePaise: lockedCustomer.balancePaise },
      );
    }

    const { orderId, items } = await params.writeOrder();
    const issued = await this.billService.issueBill(
      {
        actorId,
        customerId: customer.id,
        orderId,
        routeStamp: params.routeStamp,
        lines: toBillLines(items),
        gatepassId: params.gatepassId,
        billDate,
        billNumber: billNumber.number,
        occurredAt: billOccurredAt,
      },
      transaction,
    );
    const posted = paymentNumber
      ? await this.paymentService.post(
          {
            customerId: customer.id,
            mode: payment.mode,
            receivedPaise: split.receivedPaise,
            keptPaise: split.keptPaise,
            returnedPaise: split.returnedPaise,
            reference: payment.reference,
            gatepassId: params.gatepassId,
            actorId,
            occurredAt: paymentOccurredAt,
            idempotencyKey: `${params.idempotencyKey}:pay`,
            number: paymentNumber.number,
          },
          transaction,
        )
      : null;

    return {
      kind: "done",
      result: {
        orderId,
        billId: issued.bill.id,
        billNumber: issued.bill.number,
        billTotalPaise: issued.bill.totalPaise,
        balanceAfterBillPaise: issued.balanceAfterPaise,
        payment: posted
          ? {
              paymentId: posted.payment.id,
              number: posted.payment.number,
              keptPaise: split.keptPaise,
              returnedPaise: split.returnedPaise,
            }
          : null,
        returnedPaise: split.returnedPaise,
        balancePaise: posted ? posted.balanceAfterPaise : issued.balanceAfterPaise,
      },
      outcome: {
        bill: {
          billId: issued.bill.id,
          billVersionId: issued.billVersionId,
          versionNumber: 1,
          billNumber: issued.bill.number,
          customerId: customer.id,
          routeId: params.routeId,
          route: params.routeStamp,
          totalPaise: issued.bill.totalPaise,
          balanceAfterBillPaise: issued.balanceAfterPaise,
        },
        payment: posted
          ? {
              paymentId: posted.payment.id,
              postedEventId: posted.postedEventId,
              paymentNumber: posted.payment.number,
              customerId: customer.id,
              mode: posted.payment.mode,
              keptPaise: split.keptPaise,
              returnedPaise: split.returnedPaise,
              balanceAfterPaise: posted.balanceAfterPaise,
            }
          : null,
      },
    };
  }

  // order_items with the locked price and tax, then order_versions v1 whose header carries the
  // Route stamp as at place.
  private async writeSaleLines(
    order: SelectOrder,
    lines: ResolvedLine[],
    routeStamp: RouteStamp,
    actorId: string,
    transaction: DbExecutor,
  ): Promise<OrderItem[]> {
    const items = await insertOrderItems(
      lines.map((line) => ({
        orderId: order.id,
        varietyId: line.varietyId,
        stamp: { name: line.name, unit: line.unit, hsn: line.hsn },
        quantity: line.quantity,
        routePricePaise: line.routePricePaise,
        exempt: line.exempt,
        gstRateBps: line.gstRateBps,
      })),
      transaction,
    );
    await insertOrderVersion(
      {
        orderId: order.id,
        versionNumber: 1,
        header: { ...order, route: routeStamp },
        items,
        reason: "Placed",
        actorId,
      },
      transaction,
    );
    return items;
  }

  // Merges repeated SKUs, then checks every line: qty a whole number from 1 that fits int4 (after
  // merging), SKU sellable, a Route price on this Route, a tax period covering `day`, and a qty and
  // amount that still fit once added to the basket. Every failure is collected.
  private async resolveBasket(
    lines: CheckoutLineInput[],
    routeId: string,
    day: string,
    executor: DbExecutor = db,
  ): Promise<ResolvedBasket> {
    const badLines: BadLine[] = [];
    const quantityBySku = new Map<string, number>();
    const badQtySkus = new Set<string>();
    for (const line of lines) {
      if (!Number.isInteger(line.qty) || line.qty < 1) badQtySkus.add(line.sku);
      quantityBySku.set(line.sku, (quantityBySku.get(line.sku) ?? 0) + line.qty);
    }
    for (const [sku, quantity] of quantityBySku) {
      if (quantity > MAX_QTY) badQtySkus.add(sku);
    }
    for (const sku of badQtySkus) {
      badLines.push({ sku, reason: "bad_qty" });
      quantityBySku.delete(sku);
    }

    const varieties = await listSellableVarietiesBySkus([...quantityBySku.keys()], executor);
    const varietyBySku = new Map(varieties.map((variety) => [variety.sku, variety]));
    const prices = await this.routeService.listPricesForRoute(routeId, executor);
    const priceByVarietyId = new Map(prices.map((price) => [price.varietyId, price.pricePaise]));
    const taxFacts = await this.varietyTaxPeriodService.getCoveringTaxFacts(
      { varietyIds: varieties.map((variety) => variety.id), day },
      executor,
    );

    const resolved: ResolvedLine[] = [];
    let basketQuantity = 0;
    let basketAmount = 0n;
    for (const [sku, quantity] of quantityBySku) {
      const variety = varietyBySku.get(sku);
      if (!variety) {
        badLines.push({ sku, reason: "unknown_sku" });
        continue;
      }
      const routePricePaise = priceByVarietyId.get(variety.id);
      const facts = taxFacts.get(variety.id);
      if (routePricePaise === undefined) badLines.push({ sku, reason: "no_route_price" });
      if (!facts) badLines.push({ sku, reason: "no_tax_period" });
      if (routePricePaise === undefined || !facts) continue;
      const amountWithTax = BigInt(routePricePaise) * BigInt(quantity) * 2n;
      if (basketQuantity + quantity > MAX_INT4 || basketAmount + amountWithTax > MAX_SAFE_AMOUNT) {
        badLines.push({ sku, reason: "bad_qty" });
        continue;
      }
      basketQuantity += quantity;
      basketAmount += amountWithTax;
      resolved.push({
        sku,
        varietyId: variety.id,
        name: variety.name,
        unit: variety.unit,
        quantity,
        routePricePaise,
        exempt: facts.exempt,
        gstRateBps: facts.gstRateBps,
        hsn: facts.hsn,
      });
    }
    return { lines: resolved, badLines };
  }

  // Locks the GatePass lines in variety id order; left is issued minus sold, and a variety not on
  // the GatePass has none left. Refuses with every short line. Returns the line id per variety.
  private async lockStock(
    gatepassId: string,
    lines: ResolvedLine[],
    transaction: DbExecutor,
  ): Promise<Map<string, string>> {
    const varietyIds = lines.map((line) => line.varietyId).sort();
    const items = await lockGatepassItemsForVarieties(gatepassId, varietyIds, transaction);
    const shortLines = shortLinesOf(
      lines,
      new Map(items.map((item) => [item.varietyId, item.issuedQty - item.soldQty])),
    );
    if (shortLines.length > 0) {
      throw checkoutRefusal("short_stock", "Not enough stock on your GatePass.", {
        lines: shortLines,
      });
    }
    return new Map(items.map((item) => [item.varietyId, item.id]));
  }

  // A Pre-order's order_items as basket lines (for a fulfil quote), with SKUs for display.
  private async lockedTermsOf(items: OrderItem[]): Promise<ResolvedLine[]> {
    const labels = await listVarietyLabelsByIds(items.map((item) => item.varietyId));
    const skuByVarietyId = new Map(labels.map((label) => [label.id, label.sku]));
    return items.map((item) => ({
      sku: skuByVarietyId.get(item.varietyId) ?? "",
      varietyId: item.varietyId,
      name: item.stamp.name,
      unit: item.stamp.unit,
      quantity: item.quantity,
      routePricePaise: item.routePricePaise,
      exempt: item.exempt,
      gstRateBps: item.gstRateBps,
      hsn: item.stamp.hsn,
    }));
  }

  private async alreadyFulfilledRefusal(order: SelectOrder, executor: DbExecutor) {
    const bill = await getBillByOrderId(order.id, executor);
    const fulfilledBy = order.fulfilledBy ? await getProfileById(order.fulfilledBy) : undefined;
    return checkoutRefusal(
      "already_fulfilled",
      `This Pre-order was already fulfilled${bill ? ` as ${bill.number}` : ""}.`,
      {
        billNumber: bill?.number ?? null,
        fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
        fulfilledById: order.fulfilledBy,
        fulfilledByName: fulfilledBy?.name ?? null,
      },
    );
  }

  // The first result of a Book Now or fulfil: its Bill and MB, the checkout Payment and MP if
  // any (found from the Bill, so a fulfil retried under another key still sees it), and the
  // current Balance. With no Payment nothing was kept, so all cash received (as the retry sends
  // it again) was handed back. Fires nothing.
  private async billedResultOf(
    order: SelectOrder,
    retryPayment: ParsedCheckoutPayment,
  ): Promise<BilledCheckoutResult> {
    const bill = await getBillByOrderId(order.id);
    if (!bill) {
      throw screenRefusal(
        "checkout_already_placed",
        "This checkout key was already used to place a Pre-order",
      );
    }
    const payment = await getCheckoutPaymentForBill(bill.id);
    const balanceAfterBillPaise = await getBalanceThroughBillDebit(bill.id);
    const balance = await this.ledgerService.getBalance(order.customerId);
    return {
      orderId: order.id,
      billId: bill.id,
      billNumber: bill.number,
      billTotalPaise: bill.totalPaise,
      balanceAfterBillPaise: balanceAfterBillPaise ?? balance.balancePaise,
      payment: payment
        ? {
            paymentId: payment.id,
            number: payment.number,
            keptPaise: payment.amountKeptPaise,
            returnedPaise: payment.amountReturnedPaise,
          }
        : null,
      returnedPaise: payment
        ? payment.amountReturnedPaise
        : retryPayment.mode === "cash"
          ? retryPayment.receivedPaise
          : 0,
      balancePaise: balance.balancePaise,
    };
  }

  // The first result of a Pre-order place, with the indicative total from its locked lines.
  private async preOrderResultOf(order: SelectOrder): Promise<PreOrderResult> {
    if (order.type !== "pre_order") {
      throw screenRefusal(
        "checkout_already_placed",
        "This checkout key was already used for a Book Now",
      );
    }
    const items = await listOrderItemsByOrderId(order.id);
    const latestVersion = await getLatestOrderVersion(order.id);
    if (!latestVersion) throw internalError(`Order ${order.id} has no version`);
    const routeStamp = routeStampFromHeader(latestVersion.header);
    const seller = await this.settingsService.requireSellerSettings();
    const tax = computeBillTax(items, placeOfSupplyOf(routeStamp.delivery_state, seller.state));
    const balance = await this.ledgerService.getBalance(order.customerId);
    return {
      orderId: order.id,
      scheduledDate: order.scheduledDate ?? "",
      indicativeTotalPaise: tax.totalPaise,
      balancePaise: balance.balancePaise,
    };
  }
}

export default OrderService;
export type {
  BilledCheckoutResult,
  CheckoutActor,
  FulfilActor,
  FulfilPreOrderInput,
  PlaceBookNowInput,
  PlacePreOrderInput,
  PreOrderResult,
  Quote,
  QuoteInput,
  RoutePreorder,
};
