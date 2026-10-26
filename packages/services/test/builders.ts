import { randomUUID } from "node:crypto";

import { db, sql } from "@repo/database";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import {
  billItemsTable,
  billsTable,
  billVersionsTable,
  customersTable,
  gatepassItemsTable,
  gatepassesTable,
  ledgerEntriesTable,
  noteLinesTable,
  notesTable,
  orderItemsTable,
  ordersTable,
  orderVersionsTable,
  paymentEventsTable,
  paymentsTable,
  productsTable,
  productVarietiesTable,
  profilesTable,
  refundsTable,
  routePricesTable,
  routesTable,
  salesmenTable,
  sellerSettingsTable,
  varietyTaxPeriodsTable,
  type SelectBill,
  type SelectBillItem,
  type SelectBillVersion,
  type SelectCustomer,
  type SelectGatepass,
  type SelectNote,
  type SelectOrder,
  type SelectPayment,
  type SelectPaymentEvent,
  type SelectProduct,
  type SelectProductVariety,
  type SelectProfile,
  type SelectRefund,
  type SelectRoute,
} from "@repo/database/schema";

import { nextVarietySku, varietySkuPrefix, varietySkuSlug } from "../products/sku";

// Test builders insert minimal valid rows straight through the database layer, bypassing the
// service writes that still need a Route. Later specs extend this file instead of adding their own.

let uniqueCounter = 0;
function nextUnique(): number {
  uniqueCounter += 1;
  return uniqueCounter;
}

export async function buildProfile(
  overrides: Partial<typeof profilesTable.$inferInsert> = {},
): Promise<SelectProfile> {
  const n = nextUnique();
  const [profile] = await db
    .insert(profilesTable)
    .values({
      id: randomUUID(),
      role: "admin",
      email: `user${n}@test.motake`,
      name: `Test User ${n}`,
      ...overrides,
    })
    .returning();
  return profile!;
}

export interface BuiltSalesman {
  profile: SelectProfile;
  salesmanCode: string;
}

export async function buildSalesman(
  overrides: { name?: string; salesmanCode?: string } = {},
): Promise<BuiltSalesman> {
  const profile = await buildProfile({ role: "salesman", name: overrides.name });
  const salesmanCode = overrides.salesmanCode ?? `SM${String(nextUnique()).padStart(3, "0")}`;
  await db.insert(salesmenTable).values({ id: profile.id, salesmanCode });
  return { profile, salesmanCode };
}

export async function buildSellerSettings(
  updatedBy: string,
): Promise<typeof sellerSettingsTable.$inferSelect> {
  const [settings] = await db
    .insert(sellerSettingsTable)
    .values({
      legalName: "Motake Test Foods Pvt Ltd",
      address: "1 Test Road, Kolhapur",
      state: "Maharashtra",
      gstin: "27AAAAA0000A1Z5",
      phone: "9800000000",
      updatedBy,
    })
    .returning();
  return settings!;
}

export async function buildRoute(
  overrides: Partial<typeof routesTable.$inferInsert> = {},
): Promise<SelectRoute> {
  const n = nextUnique();
  const [route] = await db
    .insert(routesTable)
    .values({
      name: `Route ${n}`,
      code: `rt-route-${String(n).padStart(3, "0")}`,
      deliveryState: "Maharashtra",
      ...overrides,
    })
    .returning();
  return route!;
}

export async function buildProduct(
  overrides: Partial<typeof productsTable.$inferInsert> = {},
): Promise<SelectProduct> {
  const [product] = await db
    .insert(productsTable)
    .values({ name: `Product ${nextUnique()}`, ...overrides })
    .returning();
  return product!;
}

// SKU minted the way ProductService does, so tests see real `vr-` SKUs.
export async function buildVariety(
  overrides: Partial<typeof productVarietiesTable.$inferInsert> = {},
): Promise<SelectProductVariety> {
  const product = overrides.productId
    ? (
        await db
          .select()
          .from(productsTable)
          .where(sql`${productsTable.id} = ${overrides.productId}`)
      )[0]!
    : await buildProduct();
  const name = overrides.name ?? `Variety ${nextUnique()}`;
  const skuPrefix = varietySkuPrefix(varietySkuSlug(product.name, name));
  const existingSkus = await db
    .select({ sku: productVarietiesTable.sku })
    .from(productVarietiesTable)
    .where(sql`${productVarietiesTable.sku} LIKE ${`${skuPrefix}%`}`);
  const [variety] = await db
    .insert(productVarietiesTable)
    .values({
      productId: product.id,
      name,
      unit: "pack",
      sku: nextVarietySku(
        skuPrefix,
        existingSkus.map((row) => row.sku),
      ),
      ...overrides,
    })
    .returning();
  return variety!;
}

export async function buildRoutePrice(
  routeId: string,
  varietyId: string,
  pricePaise: number,
): Promise<typeof routePricesTable.$inferSelect> {
  const [routePrice] = await db
    .insert(routePricesTable)
    .values({ routeId, varietyId, pricePaise })
    .returning();
  return routePrice!;
}

export async function buildVarietyTaxPeriod(
  varietyId: string,
  overrides: Partial<typeof varietyTaxPeriodsTable.$inferInsert> = {},
): Promise<typeof varietyTaxPeriodsTable.$inferSelect> {
  const [taxPeriod] = await db
    .insert(varietyTaxPeriodsTable)
    .values({
      varietyId,
      effectiveFrom: "2020-04-01",
      hsn: "0401",
      exempt: false,
      gstRateBps: 500,
      ...overrides,
    })
    .returning();
  return taxPeriod!;
}

export async function buildCustomer(
  createdBy: string,
  overrides: Partial<typeof customersTable.$inferInsert> = {},
): Promise<SelectCustomer> {
  const routeId = overrides.routeId ?? (await buildRoute()).id;
  const n = nextUnique();
  const [customer] = await db
    .insert(customersTable)
    .values({
      shopName: `Shop ${n}`,
      phone: `98${String(n).padStart(8, "0")}`,
      address: `${n} Market Road`,
      routeId,
      einvoicingRequired: false,
      createdBy,
      ...overrides,
    })
    .returning();
  return customer!;
}

export interface GatepassLineInput {
  varietyId: string;
  issuedQty: number;
  soldQty?: number;
  returnedQty?: number;
}

export async function buildGatepass(input: {
  salesmanId: string;
  issuedBy: string;
  routeId?: string;
  businessDate?: string;
  status?: SelectGatepass["status"];
  lines: GatepassLineInput[];
}): Promise<SelectGatepass> {
  const routeId = input.routeId ?? (await buildRoute()).id;
  const [gatepass] = await db
    .insert(gatepassesTable)
    .values({
      salesmanId: input.salesmanId,
      routeId,
      businessDate: input.businessDate ?? "2026-10-25",
      status: input.status ?? "active",
      issuedBy: input.issuedBy,
    })
    .returning();
  if (input.lines.length > 0) {
    await db.insert(gatepassItemsTable).values(
      input.lines.map((line) => ({
        gatepassId: gatepass!.id,
        varietyId: line.varietyId,
        issuedQty: line.issuedQty,
        soldQty: line.soldQty ?? 0,
        returnedQty: line.returnedQty ?? 0,
      })),
    );
  }
  return gatepass!;
}

export interface LineInput {
  variety: SelectProductVariety;
  quantity: number;
  routePricePaise: number;
  exempt?: boolean;
  gstRateBps?: number;
  hsn?: string;
}

function lineStamp(line: LineInput) {
  return { name: line.variety.name, unit: line.variety.unit, hsn: line.hsn ?? "0401" };
}

function routeStamp(route: SelectRoute) {
  return { name: route.name, code: route.code, delivery_state: route.deliveryState };
}

export interface BuiltOrder {
  order: SelectOrder;
  orderItemIds: string[];
}

// An order (the sale) with its lines and order_versions v1, whose header carries the Route stamp.
export async function buildOrder(input: {
  customer: SelectCustomer;
  actorId: string;
  type?: SelectOrder["type"];
  status?: SelectOrder["status"];
  salesmanId?: string | null;
  gatepassId?: string | null;
  scheduledDate?: string | null;
  placedAt?: Date;
  fulfilledAt?: Date | null;
  lines: LineInput[];
}): Promise<BuiltOrder> {
  const type = input.type ?? "book_now";
  const [route] = await db
    .select()
    .from(routesTable)
    .where(sql`${routesTable.id} = ${input.customer.routeId}`);
  const [order] = await db
    .insert(ordersTable)
    .values({
      type,
      status: input.status ?? (type === "book_now" ? "confirmed" : "scheduled"),
      salesmanId: input.salesmanId === undefined ? null : input.salesmanId,
      customerId: input.customer.id,
      routeId: input.customer.routeId,
      gatepassId: input.gatepassId ?? null,
      scheduledDate: input.scheduledDate ?? (type === "pre_order" ? "2026-10-26" : null),
      placedAt: input.placedAt ?? new Date("2026-10-25T05:00:00Z"),
      fulfilledAt: input.fulfilledAt ?? null,
    })
    .returning();
  const items = await db
    .insert(orderItemsTable)
    .values(
      input.lines.map((line) => ({
        orderId: order!.id,
        varietyId: line.variety.id,
        stamp: lineStamp(line),
        quantity: line.quantity,
        routePricePaise: line.routePricePaise,
        exempt: line.exempt ?? false,
        gstRateBps: line.exempt ? 0 : (line.gstRateBps ?? 500),
      })),
    )
    .returning();
  await db.insert(orderVersionsTable).values({
    orderId: order!.id,
    versionNumber: 1,
    header: { ...order!, route: routeStamp(route!) },
    items,
    reason: "Placed",
    actorId: input.actorId,
  });
  return { order: order!, orderItemIds: items.map((item) => item.id) };
}

let billCounter = 0;

export interface BuiltBill {
  bill: SelectBill;
}

// A Bill (the paper) with lines, bill_versions v1 and, unless skipped, its Ledger Bill debit.
// Intra-state tax split; totals are exact paise with no round-off unless given.
export async function buildBill(input: {
  customer: SelectCustomer;
  actorId: string;
  orderId?: string | null;
  orderItemIds?: string[];
  billDate?: string;
  roundOffPaise?: number;
  skipLedgerDebit?: boolean;
  lines: LineInput[];
}): Promise<BuiltBill> {
  billCounter += 1;
  // Read before any await, so parallel builders never share a number.
  const billNumber = `TB/26-27/${String(billCounter).padStart(6, "0")}`;
  const [route] = await db
    .select()
    .from(routesTable)
    .where(sql`${routesTable.id} = ${input.customer.routeId}`);
  const lineAmounts = input.lines.map((line) => {
    const taxablePaise = line.routePricePaise * line.quantity;
    const rate = line.exempt ? 0 : (line.gstRateBps ?? 500);
    const halfTaxPaise = Math.round((taxablePaise * rate) / 2 / 10_000);
    return { taxablePaise, cgstPaise: halfTaxPaise, sgstPaise: halfTaxPaise, igstPaise: 0, rate };
  });
  const sum = (pick: (amount: (typeof lineAmounts)[number]) => number) =>
    lineAmounts.reduce((total, amount) => total + pick(amount), 0);
  const roundOffPaise = input.roundOffPaise ?? 0;
  const totalPaise =
    sum((a) => a.taxablePaise) + sum((a) => a.cgstPaise) + sum((a) => a.sgstPaise) + roundOffPaise;
  const allExempt = input.lines.every((line) => line.exempt);
  const [bill] = await db
    .insert(billsTable)
    .values({
      orderId: input.orderId ?? null,
      number: billNumber,
      legalType: allExempt ? "bill_of_supply" : "tax_invoice",
      letterhead: {
        route: routeStamp(route!),
        buyer: {
          shop_name: input.customer.shopName,
          phone: input.customer.phone,
          address: input.customer.address,
          gstin: input.customer.gstin,
        },
        seller: {
          legal_name: "Motake Test Foods Pvt Ltd",
          address: "1 Test Road, Kolhapur",
          gstin: "27AAAAA0000A1Z5",
        },
      },
      totalQuantity: input.lines.reduce((total, line) => total + line.quantity, 0),
      totalPaise,
      taxablePaise: sum((a) => a.taxablePaise),
      cgstPaise: sum((a) => a.cgstPaise),
      sgstPaise: sum((a) => a.sgstPaise),
      igstPaise: 0,
      roundOffPaise,
      billDate: input.billDate ?? "2026-10-25",
    })
    .returning();
  const items = await db
    .insert(billItemsTable)
    .values(
      input.lines.map((line, index) => ({
        billId: bill!.id,
        varietyId: line.variety.id,
        orderItemId: input.orderItemIds?.[index] ?? null,
        stamp: lineStamp(line),
        quantity: line.quantity,
        routePricePaise: line.routePricePaise,
        exempt: line.exempt ?? false,
        gstRateBps: lineAmounts[index]!.rate,
        taxablePaise: lineAmounts[index]!.taxablePaise,
        cgstPaise: lineAmounts[index]!.cgstPaise,
        sgstPaise: lineAmounts[index]!.sgstPaise,
        igstPaise: 0,
      })),
    )
    .returning();
  await db.insert(billVersionsTable).values({
    billId: bill!.id,
    versionNumber: 1,
    header: bill!,
    items,
    reason: "Raised",
    actorId: input.actorId,
  });
  if (!input.skipLedgerDebit && totalPaise > 0) {
    await db.insert(ledgerEntriesTable).values({
      customerId: input.customer.id,
      entryType: "bill",
      side: "debit",
      amountPaise: totalPaise,
      occurredAt: new Date(`${bill!.billDate}T06:00:00Z`),
      actorId: input.actorId,
      billId: bill!.id,
    });
    await db
      .update(customersTable)
      .set({ balancePaise: sql`${customersTable.balancePaise} + ${totalPaise}` })
      .where(sql`${customersTable.id} = ${input.customer.id}`);
  }
  return { bill: bill! };
}

// A Book Now with its Bill, the common case for read tests.
export async function buildBookNowWithBill(input: {
  customer: SelectCustomer;
  actorId: string;
  salesmanId?: string | null;
  status?: SelectOrder["status"];
  billDate?: string;
  placedAt?: Date;
  lines: LineInput[];
}): Promise<BuiltOrder & BuiltBill> {
  const built = await buildOrder({
    customer: input.customer,
    actorId: input.actorId,
    type: "book_now",
    status: input.status,
    salesmanId: input.salesmanId,
    placedAt: input.placedAt,
    lines: input.lines,
  });
  const { bill } = await buildBill({
    customer: input.customer,
    actorId: input.actorId,
    orderId: built.order.id,
    orderItemIds: built.orderItemIds,
    billDate: input.billDate,
    lines: input.lines,
  });
  return { ...built, bill };
}

// Money papers without their Ledger row: the procedures that write both arrive in Specs F–H, so
// money core tests post the Ledger row themselves.

export async function buildPayment(input: {
  customer: SelectCustomer;
  actorId: string;
  keptPaise: number;
  occurredAt?: Date;
  overrides?: Partial<typeof paymentsTable.$inferInsert>;
}): Promise<SelectPayment> {
  const unique = nextUnique();
  const [payment] = await db
    .insert(paymentsTable)
    .values({
      customerId: input.customer.id,
      mode: "cash",
      amountReceivedPaise: input.keptPaise,
      amountKeptPaise: input.keptPaise,
      amountReturnedPaise: 0,
      number: `TP/26-27/${String(unique).padStart(6, "0")}`,
      actorId: input.actorId,
      occurredAt: input.occurredAt ?? new Date(),
      idempotencyKey: randomUUID(),
      ...input.overrides,
    })
    .returning();
  return payment!;
}

export async function buildRefund(input: {
  customer: SelectCustomer;
  actorId: string;
  amountPaise: number;
}): Promise<SelectRefund> {
  const unique = nextUnique();
  const [refund] = await db
    .insert(refundsTable)
    .values({
      customerId: input.customer.id,
      number: `TR/26-27/${String(unique).padStart(6, "0")}`,
      mode: "upi",
      amountPaise: input.amountPaise,
      reason: "Advance paid back",
      actorId: input.actorId,
      occurredAt: new Date(),
      idempotencyKey: randomUUID(),
    })
    .returning();
  return refund!;
}

// A Note must be inserted in the same transaction as its Ledger row (deferred FK pair), so this
// takes the caller's transaction and the Ledger row id the caller will post with.
export async function buildNote(
  executor: DbExecutor,
  input: {
    bill: SelectBill;
    kind: SelectNote["kind"];
    amountPaise: number;
    ledgerEntryId: string;
    reason?: string;
  },
): Promise<SelectNote> {
  const unique = nextUnique();
  const [note] = await executor
    .insert(notesTable)
    .values({
      kind: input.kind,
      number: `TN/26-27/${String(unique).padStart(6, "0")}`,
      billId: input.bill.id,
      issuedOn: input.bill.billDate,
      reason: input.reason ?? "Damaged in transit",
      amountPaise: input.amountPaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      sellerLegalName: "Motake Test Foods Pvt Ltd",
      sellerAddress: "1 Test Road, Kolhapur",
      sellerGstin: "27AAAAA0000A1Z5",
      ledgerEntryId: input.ledgerEntryId,
    })
    .returning();
  return note!;
}

// Spec L: the shapes later specs write for real (Correct, Raise Note, Payment post), so Document
// tests can read them before those procedures exist.

// Appends a Bill version as Correct would: the header is the Bill row at that version, the items
// its lines. The live Bill row is left as it is.
export async function buildBillVersion(input: {
  bill: SelectBill;
  actorId: string;
  versionNumber: number;
  lines: LineInput[];
  seller?: { legal_name: string; address: string; gstin: string };
  reason?: string;
}): Promise<SelectBillVersion> {
  const lineAmounts = input.lines.map((line) => {
    const taxablePaise = line.routePricePaise * line.quantity;
    const rate = line.exempt ? 0 : (line.gstRateBps ?? 500);
    const halfTaxPaise = Math.round((taxablePaise * rate) / 2 / 10_000);
    return { taxablePaise, halfTaxPaise, rate };
  });
  const taxablePaise = lineAmounts.reduce((total, amount) => total + amount.taxablePaise, 0);
  const halfTaxPaise = lineAmounts.reduce((total, amount) => total + amount.halfTaxPaise, 0);
  const letterhead = input.bill.letterhead as Record<string, unknown>;
  const header = {
    ...input.bill,
    letterhead: input.seller ? { ...letterhead, seller: input.seller } : letterhead,
    totalQuantity: input.lines.reduce((total, line) => total + line.quantity, 0),
    totalPaise: taxablePaise + 2 * halfTaxPaise,
    taxablePaise,
    cgstPaise: halfTaxPaise,
    sgstPaise: halfTaxPaise,
    igstPaise: 0,
    roundOffPaise: 0,
  };
  const items: Array<Omit<SelectBillItem, "createdAt" | "updatedAt">> = input.lines.map(
    (line, index) => ({
      id: randomUUID(),
      billId: input.bill.id,
      varietyId: line.variety.id,
      orderItemId: null,
      stamp: lineStamp(line),
      quantity: line.quantity,
      routePricePaise: line.routePricePaise,
      exempt: line.exempt ?? false,
      gstRateBps: lineAmounts[index]!.rate,
      taxablePaise: lineAmounts[index]!.taxablePaise,
      cgstPaise: lineAmounts[index]!.halfTaxPaise,
      sgstPaise: lineAmounts[index]!.halfTaxPaise,
      igstPaise: 0,
    }),
  );
  const [version] = await db
    .insert(billVersionsTable)
    .values({
      billId: input.bill.id,
      versionNumber: input.versionNumber,
      header,
      items,
      reason: input.reason ?? "Corrected",
      actorId: input.actorId,
    })
    .returning();
  return version!;
}

export interface NoteLineInput {
  billVersionId: string;
  snapshotLineId: string;
  quantity: number;
  amountPaise: number;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
}

// A Note with its lines and its Ledger row, in one transaction (deferred FK pair). Credit Notes
// post a credit, Debit Notes a debit; the stored Balance is not touched.
export async function buildNoteWithLines(input: {
  bill: SelectBill;
  customer: SelectCustomer;
  actorId: string;
  kind: SelectNote["kind"];
  amountPaise: number;
  lines: NoteLineInput[];
  number?: string;
  reason?: string;
  issuedOn?: string;
  returnOrDamageOn?: string | null;
}): Promise<SelectNote> {
  return db.transaction(async (transaction) => {
    const ledgerEntryId = randomUUID();
    const note = await buildNote(transaction, {
      bill: input.bill,
      kind: input.kind,
      amountPaise: input.amountPaise,
      ledgerEntryId,
      reason: input.reason,
    });
    const [updated] = await transaction
      .update(notesTable)
      .set({
        ...(input.number ? { number: input.number } : {}),
        issuedOn: input.issuedOn ?? input.bill.billDate,
        returnOrDamageOn: input.returnOrDamageOn ?? null,
        cgstPaise: input.lines.reduce((total, line) => total + (line.cgstPaise ?? 0), 0),
        sgstPaise: input.lines.reduce((total, line) => total + (line.sgstPaise ?? 0), 0),
        igstPaise: input.lines.reduce((total, line) => total + (line.igstPaise ?? 0), 0),
      })
      .where(sql`${notesTable.id} = ${note.id}`)
      .returning();
    await transaction.insert(ledgerEntriesTable).values({
      id: ledgerEntryId,
      customerId: input.customer.id,
      entryType: input.kind === "debit_note" ? "debit_note" : "credit_note",
      side: input.kind === "debit_note" ? "debit" : "credit",
      amountPaise: input.amountPaise,
      occurredAt: new Date(`${input.bill.billDate}T08:00:00Z`),
      actorId: input.actorId,
      noteId: note.id,
      reason: note.reason,
    });
    if (input.lines.length > 0) {
      await transaction.insert(noteLinesTable).values(
        input.lines.map((line) => ({
          noteId: note.id,
          billVersionId: line.billVersionId,
          snapshotLineId: line.snapshotLineId,
          quantity: line.quantity,
          amountPaise: line.amountPaise,
          cgstPaise: line.cgstPaise ?? 0,
          sgstPaise: line.sgstPaise ?? 0,
          igstPaise: line.igstPaise ?? 0,
        })),
      );
    }
    return updated!;
  });
}

// The `posted` (or later `adjusted`) history row of a Payment.
export async function buildPaymentEvent(input: {
  payment: SelectPayment;
  actorId: string;
  kind?: SelectPaymentEvent["kind"];
  keptPaise?: number;
  reference?: string | null;
  reason?: string;
}): Promise<SelectPaymentEvent> {
  const kind = input.kind ?? "posted";
  const keptPaise = input.keptPaise ?? input.payment.amountKeptPaise;
  const [event] = await db
    .insert(paymentEventsTable)
    .values({
      paymentId: input.payment.id,
      kind,
      amountKeptPaise: keptPaise,
      previousKeptPaise: kind === "posted" ? 0 : input.payment.amountKeptPaise,
      differencePaise: kind === "posted" ? keptPaise : keptPaise - input.payment.amountKeptPaise,
      reason: input.reason ?? (kind === "posted" ? null : "Corrected"),
      mode: input.payment.mode,
      reference: input.reference === undefined ? input.payment.reference : input.reference,
      actorId: input.actorId,
      occurredAt: input.payment.occurredAt,
    })
    .returning();
  return event!;
}
