import { randomUUID } from "node:crypto";

import { db, eq } from "@repo/database";
import { billsTable } from "@repo/database/schema";
import { vi } from "vitest";

import AdminBillService from "../admin-bills";
import CustomerService from "../customers";
import DocumentService from "../documents";
import GstService from "../gst";
import OrderService from "../orders";
import type { AdminBillOutcome } from "../shared/bill-events";
import type { GstOutcome } from "../shared/gst-events";
import { buildCheckoutWorld, buildCustomer, type CheckoutWorld } from "./builders";
import { MemoryDocumentStore } from "./memory-document-store";

// Spec I tests: an e-invoicing Customer's Bills written through the real checkout (Spec F) and
// the GST, Admin Bill and Document services wired the way the API wires them.

const orderService = new OrderService();
const customerService = new CustomerService();

// Maharashtra (27) and Karnataka (29) GSTINs for the test Customer.
export const MAHARASHTRA_GSTIN = "27ABCDE1234F1Z5";
export const KARNATAKA_GSTIN = "29ABCDE1234F1Z5";

// 64 hex characters like a portal IRN; `seed` keeps each one distinct.
export function irnOf(seed: string): string {
  return seed.padEnd(64, "a").slice(0, 64);
}

export function irnFields(seed: string, overrides: Record<string, unknown> = {}) {
  return {
    irn: irnOf(seed),
    ackNumber: `1123${seed}`.slice(0, 20),
    ackDate: "2026-10-25",
    signedQrText: `signed-qr-${seed}`,
    ...overrides,
  };
}

export interface GstHarness {
  store: MemoryDocumentStore;
  gstOutcomes: GstOutcome[];
  billOutcomes: AdminBillOutcome[];
  gstService: GstService;
  adminBillService: AdminBillService;
}

// Fresh services per test: an in-memory documents store and listeners that record outcomes.
export function buildGstHarness(): GstHarness {
  const store = new MemoryDocumentStore();
  const gstOutcomes: GstOutcome[] = [];
  const billOutcomes: AdminBillOutcome[] = [];
  const gstService = new GstService(
    new DocumentService(store),
    (outcome) => {
      gstOutcomes.push(outcome);
    },
    (outcome) => {
      billOutcomes.push(outcome);
    },
  );
  return { store, gstOutcomes, billOutcomes, gstService, adminBillService: new AdminBillService() };
}

// A checkout world whose Customer has a GSTIN and E-invoicing required.
export async function buildEinvoicingWorld(
  input: { businessDate: string; deliveryState?: string; gstin?: string; einvoicing?: boolean } = {
    businessDate: "2026-10-25",
  },
): Promise<CheckoutWorld> {
  const world = await buildCheckoutWorld({
    businessDate: input.businessDate,
    deliveryState: input.deliveryState,
  });
  const customer = await customerService.updateCustomer(
    world.customer.id,
    { gstin: input.gstin ?? MAHARASHTRA_GSTIN, einvoicingRequired: input.einvoicing ?? true },
    world.admin.id,
  );
  return { ...world, customer: customer! };
}

// The same world with another Customer on its Route (one Seller master per database).
export async function withCustomer(
  world: CheckoutWorld,
  input: { gstin?: string; einvoicing: boolean },
): Promise<CheckoutWorld> {
  const customer = await buildCustomer(world.admin.id, {
    routeId: world.route.id,
    gstin: input.gstin ?? MAHARASHTRA_GSTIN,
    einvoicingRequired: input.einvoicing,
  });
  return { ...world, customer };
}

// A Book Now Bill through the real checkout. Milk is taxable (Tax Invoice); Curd alone is exempt
// (Bill of Supply).
export async function placeBill(
  world: CheckoutWorld,
  lines: { milk?: number; curd?: number } = { milk: 3, curd: 1 },
) {
  return orderService.placeBookNow(world.salesman.id, {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines: [
      ...(lines.milk ? [{ sku: world.milk.sku, qty: lines.milk }] : []),
      ...(lines.curd ? [{ sku: world.curd.sku, qty: lines.curd }] : []),
    ],
    payment: { mode: "cash", receivedPaise: 0 },
  });
}

export async function billRow(billId: string) {
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  return bill!;
}

// 11:30 IST on the given day.
export function setBusinessDay(day: string): void {
  vi.setSystemTime(new Date(`${day}T06:00:00Z`));
}

// What a call was rejected with.
export async function rejectionOf(call: Promise<unknown>): Promise<Error & { code?: string }> {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!error) throw new Error("Expected the call to be refused");
  return error as Error & { code?: string };
}
