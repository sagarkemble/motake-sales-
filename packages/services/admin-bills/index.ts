import { db } from "@repo/database";
import { getProfileById } from "@repo/database/queries/auth";
import {
  deleteBillItems,
  findNewestVersionIdsForLines,
  getBillCustomerId,
  getBillById,
  getBillByIdempotencyKey,
  getBillByOrderId,
  getBillVersionByNumber,
  getLatestBillVersion,
  insertBillVersion,
  listBillItemsByBillId,
  lockBillRow,
  updateBill,
  updateBillItem,
  type BillLetterhead,
} from "@repo/database/queries/bills";
import { isBillCancelled } from "@repo/database/queries/bills/cancelled";
import { getCustomerById, lockCustomerRow } from "@repo/database/queries/customers";
import {
  lockGatepassItemsForVarieties,
  lockGatepassRow,
  restoreSoldQtyOnCancellation,
} from "@repo/database/queries/gatepass";
import {
  getBalanceThroughBillDebit,
  getBalanceThroughLedgerEntry,
  getNoteByIdempotencyKey,
  listNoteLinesForNotes,
  listNotesForBill,
} from "@repo/database/queries/ledger";
import {
  getLatestOrderVersion,
  getOrderWithItemsById,
  insertOrderVersion,
  listOrderItemsByOrderId,
  lockOrderRow,
  updateOrder,
} from "@repo/database/queries/orders";
import { listSellableVarietiesByIds } from "@repo/database/queries/products";
import { getRouteById } from "@repo/database/queries/routes";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type {
  SelectBill,
  SelectBillItem,
  SelectBillVersion,
  SelectGatepassItem,
  SelectNote,
  SelectOrder,
} from "@repo/database/schema";

import BillService from "../bills";
import DocumentNumberService from "../document-numbers";
import { internalError, ledgerRefusal, notFound } from "../errors";
import GstCreditNoteDeadlineService from "../gst-credit-note-deadline";
import LedgerService from "../ledger";
import RouteService from "../routes";
import SettingsService from "../settings";
import {
  billPlaceOfSupply,
  billStanding,
  gstSummaryOf,
  planCancelNote,
  planCorrect,
  planRaisedNote,
  valueOf,
  type ArithmeticLine,
  type ArithmeticNote,
  type ArithmeticRefusal,
  type BillStanding,
  type CreditNoteKind,
  type NoteDraft,
} from "../shared/bill-arithmetic";
import {
  allowEveryBillLock,
  noAdminBillListener,
  notifyAdminBillOutcome,
  type AdminBillListener,
  type AdminBillOutcome,
  type BillCancelledOutcome,
  type BillLockAction,
  type BillLockHook,
  type NoteOutcome,
} from "../shared/bill-events";
import { assertCustomerActive } from "../shared/checkout";
import { dueStateOf, routeStampFromHeader, routeStampOf } from "../shared/checkout-events";
import { recordAudit } from "../shared/audit";
import { financialYearOf } from "../shared/financial-year";
import { computeBillTax, placeOfSupplyOf, type PlaceOfSupply } from "../shared/tax-engine";
import VarietyTaxPeriodService from "../variety-tax-periods";
import {
  billPaperInputSchema,
  cancelBillCoreInputSchema,
  cancelBillInputSchema,
  cancelPreOrderInputSchema,
  correctBillInputSchema,
  previewCorrectInputSchema,
  previewRaiseBillInputSchema,
  previewRaiseNoteInputSchema,
  raiseBillInputSchema,
  raiseNoteInputSchema,
  type BillPaper,
  type BillPaperInput,
  type BillTotals,
  type CancelBillCoreInput,
  type CancelBillInput,
  type CancelBillResult,
  type CancelPreOrderInput,
  type CancelPreOrderResult,
  type CorrectBillInput,
  type CorrectPreview,
  type CorrectResult,
  type NotePreview,
  type PreOrderPaper,
  type PreviewCorrectInput,
  type PreviewLine,
  type PreviewRaiseBillInput,
  type PreviewRaiseNoteInput,
  type RaiseBillBadLine,
  type RaiseBillCatalogRow,
  type RaiseBillInput,
  type RaiseBillPreview,
  type ParsedRaiseBillInput,
  type ParsedRaiseNoteInput,
  type RaiseBillResult,
  type RaiseNoteInput,
  type RaiseNotePreview,
  type RaiseNoteResult,
} from "./model";
import { writeNote, type WrittenNote } from "./note-writer";

// Raise Bill and Raise Note keys (db-decisions/0015).
const billIdempotencyConstraint = "bills_idempotency_key_unique";
const noteIdempotencyConstraint = "notes_idempotency_key_unique";

function keyReusedRefusal(paper: "Bill" | "Note") {
  return ledgerRefusal(
    "idempotency_key_reused",
    `This key was already used for a different ${paper}. Try again.`,
  );
}

// Qty per key, summing repeats, so a replay compares what was asked, not how it was typed.
function quantityByKey<Line>(
  lines: Line[],
  keyOf: (line: Line) => string,
  qtyOf: (line: Line) => number,
): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    quantities.set(keyOf(line), (quantities.get(keyOf(line)) ?? 0) + qtyOf(line));
  }
  return quantities;
}

function sameQuantities(first: Map<string, number>, second: Map<string, number>): boolean {
  return (
    first.size === second.size &&
    [...first].every(([key, quantity]) => second.get(key) === quantity)
  );
}

// Technical limits only, as at checkout: int4 quantities and safe-integer paise.
const MAX_INT4 = 2_147_483_647;
const MAX_SAFE_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

// One office Bill line with the Route price and covering tax facts it locks.
type ResolvedLine = Omit<PreviewLine, "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise">;

interface ResolvedBasket {
  lines: ResolvedLine[];
  badLines: RaiseBillBadLine[];
}

// Everything the arithmetic needs about one Bill, read in the caller's transaction.
interface BillState {
  bill: SelectBill;
  letterhead: BillLetterhead;
  items: SelectBillItem[];
  latest: SelectBillVersion;
  notes: SelectNote[];
  placeOfSupply: PlaceOfSupply;
  standing: BillStanding;
}

// A transaction's result plus what it tells Spec J after commit.
interface Run<Result> {
  result: Result;
  outcome: AdminBillOutcome;
}

const arithmeticMessages: Record<ArithmeticRefusal["reason"], string> = {
  unknown_line: "A line is not on the latest version of this Bill.",
  nothing_changed: "Nothing changed. Change a qty or the buyer text, or close Correct.",
  all_lines_zero: "Every line would be 0. Use Cancel to void a Bill.",
  below_credited_qty: "A line cannot go below the qty already on a Credit Note.",
  note_amount_zero: "This change would make a ₹0.00 Note after round-off.",
  no_lines: "Pick at least one line and qty for the Note.",
  credit_qty_above_remaining: "Credit qty is more than what is left uncredited on a line.",
  nothing_to_cancel: "Nothing is left uncredited on this Bill to cancel.",
};

function refuseArithmetic(refusalResult: ArithmeticRefusal): never {
  throw ledgerRefusal(
    refusalResult.reason,
    arithmeticMessages[refusalResult.reason],
    refusalResult.details,
  );
}

// Correct and Debit Note quantities stay inside an int4 qty and a safe-integer amount, like
// Raise Bill's basket: a line past either is refused as bad_qty instead of overflowing.
function assertQuantitiesFit(
  items: ArithmeticLine[],
  standing: BillStanding,
  lines: Array<{ lineId: string; quantity: number }>,
  mode: "correct" | "debit_note",
): void {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const remainingById = new Map(standing.lines.map((line) => [line.lineId, line.remainingQty]));
  const badLineIds = new Set<string>();
  let totalQuantity = 0;
  let totalAmount = 0n;
  for (const line of lines) {
    const item = itemById.get(line.lineId);
    if (!item) continue;
    const lineQuantity =
      mode === "debit_note" ? (remainingById.get(line.lineId) ?? 0) + line.quantity : line.quantity;
    const amountWithTax = BigInt(item.routePricePaise) * BigInt(lineQuantity) * 2n;
    if (
      line.quantity > MAX_INT4 ||
      lineQuantity > MAX_INT4 ||
      totalQuantity + lineQuantity > MAX_INT4 ||
      totalAmount + amountWithTax > MAX_SAFE_AMOUNT
    ) {
      badLineIds.add(line.lineId);
      continue;
    }
    totalQuantity += lineQuantity;
    totalAmount += amountWithTax;
  }
  if (badLineIds.size > 0) {
    throw ledgerRefusal("bad_lines", "Some quantities are too large. Lower them.", {
      lines: [...badLineIds].map((lineId) => ({ lineId, reason: "bad_qty" })),
    });
  }
}

function asArithmeticLines(items: unknown): ArithmeticLine[] {
  return items as ArithmeticLine[];
}

function asArithmeticNotes(
  notes: SelectNote[],
  lines: Awaited<ReturnType<typeof listNoteLinesForNotes>>,
) {
  return notes.map(
    (note): ArithmeticNote => ({
      kind: note.kind,
      amountPaise: note.amountPaise,
      lines: lines.filter((line) => line.noteId === note.id),
    }),
  );
}

function totalsOf(bill: Pick<SelectBill, keyof BillTotals>): BillTotals {
  return {
    taxablePaise: bill.taxablePaise,
    cgstPaise: bill.cgstPaise,
    sgstPaise: bill.sgstPaise,
    igstPaise: bill.igstPaise,
    roundOffPaise: bill.roundOffPaise,
    totalPaise: bill.totalPaise,
    totalQuantity: bill.totalQuantity,
    legalType: bill.legalType,
  };
}

function notePreviewOf(draft: NoteDraft): NotePreview {
  return {
    kind: draft.kind,
    amountPaise: draft.amountPaise,
    cgstPaise: draft.cgstPaise,
    sgstPaise: draft.sgstPaise,
    igstPaise: draft.igstPaise,
    lines: draft.lines,
  };
}

function signedEffect(outcome: NoteOutcome): number {
  return outcome.kind === "debit_note" ? outcome.amountPaise : -outcome.amountPaise;
}

// Admin money procedures on Bills (Spec G): Raise Bill, Correct, Cancel (Bill or unfulfilled
// Pre-order), Raise Note, their previews, and the Bill and Pre-order papers. Admin only (checked
// at the router), reason required, one transaction each. Lock order: the bills row (or the orders
// row for a Pre-order Cancel), the lock hook, for Cancel the order then its GatePass lines in
// variety id order, every document number (MC before MD), then the Customer (Spec B's posting).
class AdminBillService {
  private readonly billService = new BillService();
  private readonly deadlineService = new GstCreditNoteDeadlineService();
  private readonly documentNumbers = new DocumentNumberService();
  private readonly ledgerService = new LedgerService();
  private readonly routeService = new RouteService();
  private readonly settingsService = new SettingsService();
  private readonly varietyTaxPeriodService = new VarietyTaxPeriodService();

  // Spec J's listener, called once after each successful commit; Spec I's month and IRN lock.
  public constructor(
    private readonly afterCommit: AdminBillListener = noAdminBillListener,
    private readonly lockHook: BillLockHook = allowEveryBillLock,
  ) {}

  // The Varieties sellable to this Customer today: a Route price on its Route and a tax period
  // covering today.
  public async listRaiseBillCatalog(customerId: string): Promise<RaiseBillCatalogRow[]> {
    const customer = await getCustomerById(customerId);
    if (!customer) throw notFound(`Customer ${customerId} not found`);
    const prices = await this.routeService.listPricesForRoute(customer.routeId);
    const varieties = await listSellableVarietiesByIds(prices.map((price) => price.varietyId));
    const facts = await this.varietyTaxPeriodService.getCoveringTaxFacts({
      varietyIds: varieties.map((variety) => variety.id),
      day: businessDateOf(new Date()),
    });
    const priceByVarietyId = new Map(prices.map((price) => [price.varietyId, price.pricePaise]));
    return varieties.flatMap((variety) => {
      const tax = facts.get(variety.id);
      const routePricePaise = priceByVarietyId.get(variety.id);
      if (!tax || routePricePaise === undefined) return [];
      return [
        {
          varietyId: variety.id,
          sku: variety.sku,
          name: variety.name,
          unit: variety.unit,
          productName: variety.productName,
          routePricePaise,
          hsn: tax.hsn,
          exempt: tax.exempt,
          gstRateBps: tax.gstRateBps,
        },
      ];
    });
  }

  // What the office Bill would be today, with every unsellable line listed. No writes.
  public async previewRaiseBill(input: PreviewRaiseBillInput): Promise<RaiseBillPreview> {
    const parsedInput = previewRaiseBillInputSchema.parse(input);
    const customer = await getCustomerById(parsedInput.customerId);
    assertCustomerActive(customer, parsedInput.customerId);
    const route = await getRouteById(customer.routeId);
    if (!route) throw notFound(`Route ${customer.routeId} not found`);
    const basket = await this.resolveBasket(
      parsedInput.lines,
      route.id,
      businessDateOf(new Date()),
    );
    const seller = await this.settingsService.requireSellerSettings();
    const tax = computeBillTax(basket.lines, placeOfSupplyOf(route.deliveryState, seller.state));
    return {
      lines: tax.lines,
      totals: { ...totalsOf(tax), grossPaise: tax.grossPaise },
      badLines: basket.badLines,
      balance: await this.ledgerService.getBalance(customer.id),
    };
  }

  // An office Bill: no order, salesman or GatePass, no stock. Allocates MB first, then Spec F's
  // issuer writes the Bill, its lines, v1 (Raised) and the Ledger debit with the Admin's reason.
  public async raiseBill(actorProfileId: string, input: RaiseBillInput): Promise<RaiseBillResult> {
    const parsedInput = raiseBillInputSchema.parse(input);
    if (parsedInput.lines.length === 0) {
      throw ledgerRefusal("empty_basket", "Add at least one Variety to the Bill.");
    }
    const firstBill = await getBillByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstBill) return this.replayRaiseBill(firstBill, parsedInput);
    let run: Run<RaiseBillResult>;
    try {
      run = await this.runRaiseBill(actorProfileId, parsedInput);
    } catch (raiseError) {
      // A concurrent attempt with the same key won the insert; this one rolled back whole,
      // including its MB number.
      if (violatedUniqueConstraint(raiseError) === billIdempotencyConstraint) {
        const winner = await getBillByIdempotencyKey(parsedInput.idempotencyKey);
        if (winner) return this.replayRaiseBill(winner, parsedInput);
      }
      throw raiseError;
    }
    await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  private async runRaiseBill(
    actorProfileId: string,
    parsedInput: ParsedRaiseBillInput,
  ): Promise<Run<RaiseBillResult>> {
    return runInTransaction(async (transaction): Promise<Run<RaiseBillResult>> => {
      const billDate = businessDateOf(new Date());
      const customer = await getCustomerById(parsedInput.customerId, transaction);
      assertCustomerActive(customer, parsedInput.customerId);
      const route = await getRouteById(customer.routeId, transaction);
      if (!route) throw notFound(`Route ${customer.routeId} not found`);
      const basket = await this.resolveBasket(parsedInput.lines, route.id, billDate, transaction);
      if (basket.badLines.length > 0) {
        throw ledgerRefusal("bad_lines", "Some lines cannot be billed. Remove or fix them.", {
          lines: basket.badLines,
        });
      }

      const billNumber = await this.documentNumbers.allocate(
        { kind: "bill", financialYear: financialYearOf(billDate), actorId: actorProfileId },
        transaction,
      );
      const issued = await this.billService.issueBill(
        {
          actorId: actorProfileId,
          customerId: customer.id,
          orderId: null,
          routeStamp: routeStampOf(route),
          lines: basket.lines.map((line) => ({
            varietyId: line.varietyId,
            orderItemId: null,
            stamp: { name: line.name, unit: line.unit, hsn: line.hsn },
            quantity: line.quantity,
            routePricePaise: line.routePricePaise,
            exempt: line.exempt,
            gstRateBps: line.gstRateBps,
          })),
          gatepassId: null,
          billDate,
          billNumber: billNumber.number,
          reason: parsedInput.reason,
          idempotencyKey: parsedInput.idempotencyKey,
        },
        transaction,
      );
      return {
        result: {
          billId: issued.bill.id,
          billNumber: issued.bill.number,
          billVersionId: issued.billVersionId,
          totalPaise: issued.bill.totalPaise,
          balancePaise: issued.balanceAfterPaise,
        },
        outcome: {
          kind: "bill_raised",
          customerId: customer.id,
          reason: parsedInput.reason,
          balanceAfterPaise: issued.balanceAfterPaise,
          billId: issued.bill.id,
          billNumber: issued.bill.number,
          billVersionId: issued.billVersionId,
          versionNumber: 1,
          totalPaise: issued.bill.totalPaise,
        },
      };
    });
  }

  // The first Raise Bill's result for a retried key, from its version 1; the same key for another
  // Customer or other Variety quantities is refused. Nothing is written or sent.
  private async replayRaiseBill(
    bill: SelectBill,
    input: ParsedRaiseBillInput,
  ): Promise<RaiseBillResult> {
    const [firstVersion, customerId, balanceAfterBillPaise] = await Promise.all([
      getBillVersionByNumber(bill.id, 1),
      getBillCustomerId(bill.id),
      getBalanceThroughBillDebit(bill.id),
    ]);
    if (!firstVersion || customerId === null || balanceAfterBillPaise === undefined) {
      throw internalError(`Bill ${bill.number} has no version 1 or Bill debit`);
    }
    const firstItems = firstVersion.items as SelectBillItem[];
    const sameBill =
      customerId === input.customerId &&
      sameQuantities(
        quantityByKey(
          firstItems,
          (item) => item.varietyId,
          (item) => item.quantity,
        ),
        quantityByKey(
          input.lines,
          (line) => line.varietyId,
          (line) => line.quantity,
        ),
      );
    if (!sameBill) throw keyReusedRefusal("Bill");
    return {
      billId: bill.id,
      billNumber: bill.number,
      billVersionId: firstVersion.id,
      totalPaise: (firstVersion.header as SelectBill).totalPaise,
      balancePaise: balanceAfterBillPaise,
    };
  }

  // What Correct would do (history only, Debit Note, Credit Note or both) with the new totals and
  // the double-count warning. Refuses as Correct would; no writes.
  public async previewCorrect(input: PreviewCorrectInput): Promise<CorrectPreview> {
    const parsedInput = previewCorrectInputSchema.parse(input);
    const bill = await getBillById(parsedInput.billId);
    if (!bill) throw notFound(`Bill ${parsedInput.billId} not found`);
    await this.assertOpenBill(bill, "correct", db);
    await this.activeCustomerOf(bill, db);
    const { state, plan } = await this.planCorrectFor(bill, parsedInput, db);
    return {
      classification: plan.classification,
      debitNote: plan.debitNote && notePreviewOf(plan.debitNote),
      creditNote: plan.creditNote && notePreviewOf(plan.creditNote),
      totals: totalsOf(plan.tax),
      netDifferencePaise: plan.netDifferencePaise,
      lines: plan.lines.map((line) => ({
        lineId: line.id,
        previousQty: line.previousQty,
        quantity: line.quantity,
        removed: line.removed,
      })),
      billHasNotes: state.standing.hasNotes,
    };
  }

  // Fixes a wrong entry on the latest version: line qty (0 removes) and the buyer text, at the
  // frozen price and tax facts. Rewrites the live Bill and its lines in place (surviving line ids
  // kept), appends a version, and writes the Credit and Debit Notes the change needs, pointing at
  // the replaced version. No stock goes back to any GatePass.
  public async correctBill(
    actorProfileId: string,
    input: CorrectBillInput,
  ): Promise<CorrectResult> {
    const parsedInput = correctBillInputSchema.parse(input);
    const run = await runInTransaction(async (transaction): Promise<Run<CorrectResult>> => {
      const bill = await this.lockOpenBill(parsedInput.billId, "correct", transaction);
      const customerId = await this.activeCustomerOf(bill, transaction);
      const { state, plan, buyer, issuedOn } = await this.planCorrectFor(
        bill,
        parsedInput,
        transaction,
      );

      const creditNumber = plan.creditNote
        ? await this.allocateNoteNumber("credit_note", issuedOn, actorProfileId, transaction)
        : null;
      const debitNumber = plan.debitNote
        ? await this.allocateNoteNumber("debit_note", issuedOn, actorProfileId, transaction)
        : null;

      const removedIds: string[] = [];
      for (const line of plan.lines) {
        if (line.removed) removedIds.push(line.id);
        else if (line.quantity !== line.previousQty) {
          await updateBillItem(
            line.id,
            {
              quantity: line.quantity,
              taxablePaise: line.taxablePaise,
              cgstPaise: line.cgstPaise,
              sgstPaise: line.sgstPaise,
              igstPaise: line.igstPaise,
            },
            transaction,
          );
        }
      }
      await deleteBillItems(removedIds, transaction);
      const updated = await updateBill(
        bill.id,
        {
          legalType: plan.tax.legalType,
          letterhead: { ...state.letterhead, buyer },
          totalQuantity: plan.tax.totalQuantity,
          totalPaise: plan.tax.totalPaise,
          taxablePaise: plan.tax.taxablePaise,
          cgstPaise: plan.tax.cgstPaise,
          sgstPaise: plan.tax.sgstPaise,
          igstPaise: plan.tax.igstPaise,
          roundOffPaise: plan.tax.roundOffPaise,
        },
        transaction,
      );
      const version = await insertBillVersion(
        {
          billId: bill.id,
          versionNumber: state.latest.versionNumber + 1,
          header: updated,
          items: await listBillItemsByBillId(bill.id, transaction),
          reason: parsedInput.reason,
          actorId: actorProfileId,
        },
        transaction,
      );

      const seller = await this.settingsService.requireSellerSettings(transaction);
      const written: WrittenNote[] = [];
      for (const [draft, number] of [
        [plan.creditNote, creditNumber],
        [plan.debitNote, debitNumber],
      ] as const) {
        if (!draft || !number) continue;
        written.push(
          await writeNote(
            {
              draft,
              number,
              billId: bill.id,
              billVersionId: state.latest.id,
              customerId,
              actorId: actorProfileId,
              issuedOn,
              reason: parsedInput.reason,
              returnOrDamageOn: null,
              seller,
            },
            transaction,
          ),
        );
      }
      if (written.length === 0) {
        // A text-only Correct posts nothing, so no Ledger post locks the Customer: hold the row
        // and re-check it is still active (Spec F's pattern), last in the lock order.
        assertCustomerActive(await lockCustomerRow(customerId, "share", transaction), customerId);
      }
      const balanceAfterPaise =
        written.at(-1)?.posted.balanceAfterPaise ??
        (await this.ledgerService.getBalance(customerId, transaction)).balancePaise;
      const notes = written.map((note) => note.outcome);
      return {
        result: {
          billId: bill.id,
          billVersionId: version.id,
          versionNumber: version.versionNumber,
          classification: plan.classification,
          notes,
          totalPaise: updated.totalPaise,
          balancePaise: balanceAfterPaise,
        },
        outcome: {
          kind: "bill_corrected",
          customerId,
          reason: parsedInput.reason,
          balanceAfterPaise,
          billId: bill.id,
          billNumber: bill.number,
          billVersionId: version.id,
          versionNumber: version.versionNumber,
          notes,
          balanceChanged: notes.reduce((total, note) => total + signedEffect(note), 0) !== 0,
          netDifferencePaise: plan.netDifferencePaise,
        },
      };
    });
    await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // Voids a billed Bill: one Credit Note for the remaining uncredited value (GST before the
  // deadline, Commercial after), so the Bill nets to zero. Payments stay; the number is kept.
  public async cancelBill(
    actorProfileId: string,
    input: CancelBillInput,
  ): Promise<CancelBillResult> {
    const parsedInput = cancelBillInputSchema.parse(input);
    const run = await runInTransaction((transaction) =>
      this.cancelBillInTransaction(actorProfileId, parsedInput, transaction),
    );
    await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // The Cancel core in the caller's transaction, returning the outcome for the caller to fire
  // after its own commit (Spec I's portal cancellation passes action portal_cancel). Restores
  // stock only to a Book Now's GatePass that is still active, capped at the order line's qty;
  // marks the order cancelled with a new order version; writes the one bill/cancelled audit row.
  public async cancelBillInTransaction(
    actorProfileId: string,
    input: CancelBillCoreInput,
    transaction: DbExecutor,
  ): Promise<Run<CancelBillResult> & { outcome: BillCancelledOutcome }> {
    const parsedInput = cancelBillCoreInputSchema.parse(input);
    const bill = await lockBillRow(parsedInput.billId, transaction);
    if (!bill) throw notFound(`Bill ${parsedInput.billId} not found`);
    if (await isBillCancelled(bill.id, transaction)) {
      throw ledgerRefusal("already_cancelled", `Bill ${bill.number} is already cancelled.`);
    }
    await this.assertLockAllows(bill, parsedInput.action, transaction);
    const customerId = await this.activeCustomerOf(bill, transaction);
    const state = await this.loadBillState(bill, transaction);
    if (parsedInput.expectedVersionNumber !== undefined) {
      this.assertExpectedVersion(state, parsedInput.expectedVersionNumber);
    }

    const order = bill.orderId ? await lockOrderRow(bill.orderId, transaction) : undefined;
    const stockItems = await this.lockRestorableStock(order, state, transaction);

    const issuedOn = businessDateOf(new Date());
    const kind = await this.creditNoteKindFor(bill, issuedOn, transaction);
    const plan = planCancelNote({ kind, standing: state.standing });
    if (!plan.ok) refuseArithmetic(plan);
    const number = await this.allocateNoteNumber(
      "credit_note",
      issuedOn,
      actorProfileId,
      transaction,
    );
    const seller = await this.settingsService.requireSellerSettings(transaction);
    // A line Correct removed can still have remaining qty (a Debit Note raised it above the live
    // qty); its Note line points at the newest version that still holds it (db-decisions/0006).
    const lineVersionIds = await findNewestVersionIdsForLines(
      bill.id,
      plan.note.lines.map((line) => line.lineId),
      transaction,
    );
    const written = await writeNote(
      {
        draft: plan.note,
        number,
        billId: bill.id,
        billVersionId: state.latest.id,
        lineVersionIds,
        customerId,
        actorId: actorProfileId,
        issuedOn,
        reason: parsedInput.reason,
        returnOrDamageOn: null,
        seller,
      },
      transaction,
    );

    const stockRestored = await this.restoreStock(order, state, stockItems, transaction);
    if (order) {
      await this.markOrderCancelled(order, actorProfileId, parsedInput.reason, transaction);
    }
    await recordAudit(
      {
        actorId: actorProfileId,
        action: "cancelled",
        entityType: "bill",
        entityId: bill.id,
        customerId,
        reason: parsedInput.reason,
        payload: {
          creditNoteId: written.note.id,
          creditNoteNumber: written.note.number,
          amountPaise: written.note.amountPaise,
          stockRestored,
        },
      },
      transaction,
    );
    return {
      result: {
        billId: bill.id,
        creditNote: written.outcome,
        stockRestored,
        balancePaise: written.posted.balanceAfterPaise,
      },
      outcome: {
        kind: "bill_cancelled",
        customerId,
        reason: parsedInput.reason,
        balanceAfterPaise: written.posted.balanceAfterPaise,
        billId: bill.id,
        billNumber: bill.number,
        creditNote: written.outcome,
      },
    };
  }

  // An unfulfilled Pre-order: cancelled with a new order version. No Bill, number, Note, Ledger
  // row, stock change or audit row (nothing was billed).
  public async cancelPreOrder(
    actorProfileId: string,
    input: CancelPreOrderInput,
  ): Promise<CancelPreOrderResult> {
    const parsedInput = cancelPreOrderInputSchema.parse(input);
    const run = await runInTransaction(async (transaction): Promise<Run<CancelPreOrderResult>> => {
      const order = await lockOrderRow(parsedInput.orderId, transaction);
      if (!order) throw notFound(`Order ${parsedInput.orderId} not found`);
      if (order.type !== "pre_order") {
        throw ledgerRefusal(
          "not_a_pre_order",
          "Only a Pre-order is cancelled here. Cancel a Book Now from its Bill.",
          { orderId: order.id },
        );
      }
      if (order.status === "fulfilled") {
        throw ledgerRefusal(
          "already_fulfilled",
          "This Pre-order was already fulfilled. Cancel its Bill instead.",
          { orderId: order.id },
        );
      }
      if (order.status === "cancelled") {
        throw ledgerRefusal("already_cancelled", "This Pre-order is already cancelled.", {
          orderId: order.id,
        });
      }
      // No Ledger post takes the Customer row here, so hold it for the check (Spec F's pattern).
      const customer = await lockCustomerRow(order.customerId, "share", transaction);
      assertCustomerActive(customer, order.customerId);
      await this.markOrderCancelled(order, actorProfileId, parsedInput.reason, transaction);
      const balance = await this.ledgerService.getBalance(order.customerId, transaction);
      return {
        result: { orderId: order.id, balancePaise: balance.balancePaise },
        outcome: {
          kind: "pre_order_cancelled",
          customerId: order.customerId,
          reason: parsedInput.reason,
          balanceAfterPaise: balance.balancePaise,
          orderId: order.id,
        },
      };
    });
    await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  // The orders cancel entry: an unfulfilled Pre-order is cancelled as such; an order with a Bill
  // cancels that Bill at its latest version. Returns the order as it now stands.
  public async cancelOrder(
    actorProfileId: string,
    input: CancelPreOrderInput,
  ): Promise<SelectOrder> {
    const parsedInput = cancelPreOrderInputSchema.parse(input);
    const bill = await getBillByOrderId(parsedInput.orderId);
    if (!bill) {
      await this.cancelPreOrder(actorProfileId, parsedInput);
    } else {
      const run = await runInTransaction((transaction) =>
        this.cancelBillInTransaction(
          actorProfileId,
          { billId: bill.id, reason: parsedInput.reason },
          transaction,
        ),
      );
      await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    }
    const order = await getOrderWithItemsById(parsedInput.orderId);
    if (!order) throw notFound(`Order ${parsedInput.orderId} not found`);
    return order.order;
  }

  // The Note Raise Note would write, with the double-count warning. No writes.
  public async previewRaiseNote(input: PreviewRaiseNoteInput): Promise<RaiseNotePreview> {
    const parsedInput = previewRaiseNoteInputSchema.parse(input);
    const bill = await getBillById(parsedInput.billId);
    if (!bill) throw notFound(`Bill ${parsedInput.billId} not found`);
    await this.assertNotCancelled(bill, db);
    await this.activeCustomerOf(bill, db);
    const { state, draft } = await this.planNoteFor(bill, parsedInput, db);
    return { note: notePreviewOf(draft), billHasNotes: state.standing.hasNotes };
  }

  // An independent GST Credit Note, Commercial Credit Note or Debit Note on chosen lines of the
  // latest version. Never rewrites the Bill or its history; allowed in a filed month (the lock
  // hook is not asked).
  public async raiseNote(actorProfileId: string, input: RaiseNoteInput): Promise<RaiseNoteResult> {
    const parsedInput = raiseNoteInputSchema.parse(input);
    if (parsedInput.kind === "debit_note" && parsedInput.returnOrDamageOn) {
      throw ledgerRefusal(
        "return_date_on_debit_note",
        "A return or damage date goes on a Credit Note only.",
      );
    }
    const firstNote = await getNoteByIdempotencyKey(parsedInput.idempotencyKey);
    if (firstNote) return this.replayRaiseNote(firstNote, parsedInput);
    let run: Run<RaiseNoteResult> | { replay: SelectNote };
    try {
      run = await this.runRaiseNote(actorProfileId, parsedInput);
    } catch (raiseError) {
      if (violatedUniqueConstraint(raiseError) === noteIdempotencyConstraint) {
        const winner = await getNoteByIdempotencyKey(parsedInput.idempotencyKey);
        if (winner) return this.replayRaiseNote(winner, parsedInput);
      }
      throw raiseError;
    }
    if ("replay" in run) return this.replayRaiseNote(run.replay, parsedInput);
    await notifyAdminBillOutcome(this.afterCommit, run.outcome);
    return run.result;
  }

  private async runRaiseNote(
    actorProfileId: string,
    parsedInput: ParsedRaiseNoteInput,
  ): Promise<Run<RaiseNoteResult> | { replay: SelectNote }> {
    return runInTransaction(async (transaction) => {
      const bill = await lockBillRow(parsedInput.billId, transaction);
      if (!bill) throw notFound(`Bill ${parsedInput.billId} not found`);
      // A retry that waited on the Bill lock behind its first attempt.
      const winner = await getNoteByIdempotencyKey(parsedInput.idempotencyKey, transaction);
      if (winner) return { replay: winner };
      await this.assertNotCancelled(bill, transaction);
      const customerId = await this.activeCustomerOf(bill, transaction);
      const { state, draft, issuedOn } = await this.planNoteFor(bill, parsedInput, transaction);
      const number = await this.allocateNoteNumber(
        draft.kind === "debit_note" ? "debit_note" : "credit_note",
        issuedOn,
        actorProfileId,
        transaction,
      );
      const seller = await this.settingsService.requireSellerSettings(transaction);
      const written = await writeNote(
        {
          draft,
          number,
          billId: bill.id,
          billVersionId: state.latest.id,
          customerId,
          actorId: actorProfileId,
          issuedOn,
          reason: parsedInput.reason,
          returnOrDamageOn: parsedInput.returnOrDamageOn ?? null,
          seller,
          idempotencyKey: parsedInput.idempotencyKey,
        },
        transaction,
      );
      return {
        result: {
          ...written.outcome,
          billId: bill.id,
          balancePaise: written.posted.balanceAfterPaise,
        },
        outcome: {
          kind: "note_raised",
          customerId,
          reason: parsedInput.reason,
          balanceAfterPaise: written.posted.balanceAfterPaise,
          billId: bill.id,
          billNumber: bill.number,
          note: written.outcome,
          differencePaise: signedEffect(written.outcome),
        },
      };
    });
  }

  // The first Raise Note's result for a retried key; the same key for another Bill, kind or line
  // quantities is refused. Nothing is written or sent.
  private async replayRaiseNote(
    note: SelectNote,
    input: ParsedRaiseNoteInput,
  ): Promise<RaiseNoteResult> {
    const [lines, balanceAfterNotePaise] = await Promise.all([
      listNoteLinesForNotes([note.id]),
      getBalanceThroughLedgerEntry(note.ledgerEntryId),
    ]);
    if (balanceAfterNotePaise === undefined) {
      throw internalError(`Note ${note.number} has no Ledger row`);
    }
    const sameNote =
      note.billId === input.billId &&
      note.kind === input.kind &&
      sameQuantities(
        quantityByKey(
          lines,
          (line) => line.snapshotLineId,
          (line) => line.quantity,
        ),
        quantityByKey(
          input.lines,
          (line) => line.lineId,
          (line) => line.quantity,
        ),
      );
    if (!sameNote) throw keyReusedRefusal("Note");
    return {
      noteId: note.id,
      number: note.number,
      kind: note.kind,
      amountPaise: note.amountPaise,
      billId: note.billId,
      balancePaise: balanceAfterNotePaise,
    };
  }

  // The Bill paper at its latest version: header, lines and GST summary, Notes, per line credited
  // and remaining qty, lock state, actions and the Customer's current Balance. No Bill history.
  public async getBillPaper(input: BillPaperInput): Promise<BillPaper> {
    const parsedInput = billPaperInputSchema.parse(input);
    const bill = await getBillById(parsedInput.billId);
    if (!bill) throw notFound(`Bill ${parsedInput.billId} not found`);
    const state = await this.loadBillState(bill, db);
    const shown = state.latest;
    const [actor, cancelled, customerId] = await Promise.all([
      getProfileById(shown.actorId),
      isBillCancelled(bill.id),
      getBillCustomerId(bill.id),
    ]);
    const customer = customerId ? await getCustomerById(customerId) : undefined;
    const orderWithItems = bill.orderId ? await getOrderWithItemsById(bill.orderId) : undefined;
    const lock = cancelled
      ? null
      : {
          correct: await this.lockHook({ bill, action: "correct" }, db),
          cancel: await this.lockHook({ bill, action: "cancel" }, db),
        };
    // A deactivated Customer allows reads only.
    const open = !cancelled && customer?.status === "active";
    const header = shown.header as SelectBill;
    const standingById = new Map(state.standing.lines.map((line) => [line.lineId, line]));
    const shownItems = shown.items as Array<
      SelectBillItem & { stamp: { name: string; unit: string; hsn: string } }
    >;

    return {
      bill: {
        id: bill.id,
        number: bill.number,
        billDate: bill.billDate,
        orderId: bill.orderId,
        placedAt: orderWithItems?.order.placedAt ?? bill.createdAt,
        billNote: orderWithItems?.order.notes ?? null,
        cancelled,
        irn: bill.irn,
        latestVersionNumber: state.latest.versionNumber,
      },
      customer: customer
        ? { id: customer.id, shopName: customer.shopName, status: customer.status }
        : null,
      version: {
        id: shown.id,
        versionNumber: shown.versionNumber,
        reason: shown.reason,
        actorName: actor?.name ?? null,
        createdAt: shown.createdAt,
        hasPdf: shown.pdfKey !== null,
        legalType: header.legalType,
        letterhead: header.letterhead as BillLetterhead,
        totals: totalsOf(header),
      },
      lines: shownItems.map((item) => {
        const standing = standingById.get(item.id);
        return {
          id: item.id,
          varietyId: item.varietyId,
          name: item.stamp.name,
          unit: item.stamp.unit,
          hsn: item.stamp.hsn,
          routePricePaise: item.routePricePaise,
          exempt: item.exempt,
          gstRateBps: item.gstRateBps,
          quantity: item.quantity,
          taxablePaise: item.taxablePaise,
          cgstPaise: item.cgstPaise,
          sgstPaise: item.sgstPaise,
          igstPaise: item.igstPaise,
          amountPaise: valueOf(item),
          creditedQty: standing?.creditedQty ?? 0,
          remainingQty: standing?.remainingQty ?? 0,
        };
      }),
      gstSummary: gstSummaryOf(shownItems),
      notes: state.notes.map((note) => ({
        id: note.id,
        kind: note.kind,
        number: note.number,
        issuedOn: note.issuedOn,
        amountPaise: note.amountPaise,
        reason: note.reason,
        returnOrDamageOn: note.returnOrDamageOn,
        hasPdf: note.pdfKey !== null,
      })),
      lock,
      actions: {
        canCorrect: open && Boolean(lock?.correct.allowed),
        canCancel: open && Boolean(lock?.cancel.allowed),
        canRaiseNote: open,
      },
      balance: customerId ? await this.ledgerService.getBalance(customerId) : null,
    };
  }

  // The Pre-order paper: Customer, the place-time Route stamp, scheduled date, status, lines at
  // the locked Route price and who placed it.
  public async getPreOrderPaper(orderId: string): Promise<PreOrderPaper> {
    const orderWithItems = await getOrderWithItemsById(orderId);
    if (!orderWithItems) throw notFound(`Order ${orderId} not found`);
    const { order, items } = orderWithItems;
    if (order.type !== "pre_order") {
      throw ledgerRefusal("not_a_pre_order", "This order is a Book Now, not a Pre-order.", {
        orderId: order.id,
      });
    }
    const latestVersion = await getLatestOrderVersion(order.id);
    if (!latestVersion) throw internalError(`Order ${order.id} has no version`);
    const route = routeStampFromHeader(latestVersion.header);
    const customer = await getCustomerById(order.customerId);
    if (!customer) throw notFound(`Customer ${order.customerId} not found`);
    const placedBy = order.salesmanId ? await getProfileById(order.salesmanId) : undefined;
    const seller = await this.settingsService.getSellerSettings();
    const bill = await getBillByOrderId(order.id);
    const today = businessDateOf(new Date());
    const scheduledDate = order.scheduledDate ?? today;
    const open = order.status === "scheduled" || order.status === "due";
    return {
      order: {
        id: order.id,
        status: order.status,
        placedAt: order.placedAt,
        notes: order.notes,
        fulfilledAt: order.fulfilledAt,
        cancelledAt: order.cancelledAt,
        scheduledDate,
        dueState: dueStateOf(scheduledDate, today),
      },
      customer: {
        id: customer.id,
        shopName: customer.shopName,
        phone: customer.phone,
        status: customer.status,
      },
      route,
      placedByName: placedBy?.name ?? null,
      lines: items.map((item) => ({
        varietyId: item.varietyId,
        name: item.stamp.name,
        unit: item.stamp.unit,
        hsn: item.stamp.hsn,
        quantity: item.quantity,
        routePricePaise: item.routePricePaise,
        exempt: item.exempt,
        gstRateBps: item.gstRateBps,
      })),
      indicativeTotalPaise: seller
        ? computeBillTax(items, placeOfSupplyOf(route.delivery_state, seller.state)).totalPaise
        : null,
      bill: bill ? { id: bill.id, number: bill.number } : null,
      actions: { canCancel: open, canFulfil: open && scheduledDate <= today },
    };
  }

  // --- Internals.

  private async loadBillState(bill: SelectBill, executor: DbExecutor): Promise<BillState> {
    const [items, latest, first, notes, seller] = await Promise.all([
      listBillItemsByBillId(bill.id, executor),
      getLatestBillVersion(bill.id, executor),
      getBillVersionByNumber(bill.id, 1, executor),
      listNotesForBill(bill.id, executor),
      this.settingsService.getSellerSettings(executor),
    ]);
    if (!latest || !first) throw internalError(`Bill ${bill.id} has no version`);
    const noteLines = await listNoteLinesForNotes(
      notes.map((note) => note.id),
      executor,
    );
    const letterhead = bill.letterhead as BillLetterhead;
    const firstItems = asArithmeticLines(first.items);
    const placeOfSupply = billPlaceOfSupply(
      firstItems,
      placeOfSupplyOf(
        letterhead.route.delivery_state,
        seller?.state ?? letterhead.route.delivery_state,
      ),
    );
    const standing = billStanding({
      firstItems,
      currentItems: items,
      notes: asArithmeticNotes(notes, noteLines),
      // The Ledger Bill debit is the total as issued (v1).
      billDebitPaise: (first.header as SelectBill).totalPaise,
      placeOfSupply,
    });
    return { bill, letterhead, items, latest, notes, placeOfSupply, standing };
  }

  // Locks the bills row and refuses a cancelled Bill and one the lock hook closes.
  private async lockOpenBill(
    billId: string,
    action: BillLockAction,
    transaction: DbExecutor,
  ): Promise<SelectBill> {
    const bill = await lockBillRow(billId, transaction);
    if (!bill) throw notFound(`Bill ${billId} not found`);
    await this.assertOpenBill(bill, action, transaction);
    return bill;
  }

  // Refuses a cancelled Bill and one the lock hook closes (writes and their previews alike).
  private async assertOpenBill(
    bill: SelectBill,
    action: BillLockAction,
    executor: DbExecutor,
  ): Promise<void> {
    await this.assertNotCancelled(bill, executor);
    await this.assertLockAllows(bill, action, executor);
  }

  private async assertNotCancelled(bill: SelectBill, executor: DbExecutor): Promise<void> {
    if (await isBillCancelled(bill.id, executor)) {
      throw ledgerRefusal("bill_cancelled", `Bill ${bill.number} is cancelled.`);
    }
  }

  private async assertLockAllows(
    bill: SelectBill,
    action: BillLockAction,
    transaction: DbExecutor,
  ): Promise<void> {
    const decision = await this.lockHook({ bill, action }, transaction);
    if (!decision.allowed) {
      throw ledgerRefusal("bill_locked", decision.message, { lockReason: decision.reason });
    }
  }

  // The Bill's Customer, refused customer_inactive when deactivated (reads only).
  private async activeCustomerOf(bill: SelectBill, executor: DbExecutor): Promise<string> {
    const customerId = await getBillCustomerId(bill.id, executor);
    if (!customerId) throw internalError(`Bill ${bill.number} has no Customer`);
    assertCustomerActive(await getCustomerById(customerId, executor), customerId);
    return customerId;
  }

  private assertExpectedVersion(state: BillState, expectedVersionNumber: number): void {
    if (state.latest.versionNumber !== expectedVersionNumber) {
      throw ledgerRefusal(
        "stale_version",
        `Bill ${state.bill.number} changed to version ${state.latest.versionNumber} while you were looking at version ${expectedVersionNumber}. Reload it.`,
        { latestVersionNumber: state.latest.versionNumber },
      );
    }
  }

  // GST Credit Note on or before the deadline of the Bill's financial year, Commercial after.
  private async creditNoteKindFor(
    bill: SelectBill,
    onDate: string,
    executor: DbExecutor,
  ): Promise<CreditNoteKind> {
    const deadline = await this.deadlineService.isGstCreditNoteAllowed(
      { billDate: bill.billDate, onDate },
      executor,
    );
    return deadline.allowed ? "gst_credit_note" : "commercial_credit_note";
  }

  private async allocateNoteNumber(
    kind: "credit_note" | "debit_note",
    issuedOn: string,
    actorProfileId: string,
    transaction: DbExecutor,
  ): Promise<string> {
    const allocated = await this.documentNumbers.allocate(
      { kind, financialYear: financialYearOf(issuedOn), actorId: actorProfileId },
      transaction,
    );
    return allocated.number;
  }

  private async planCorrectFor(
    bill: SelectBill,
    input: {
      expectedVersionNumber: number;
      lines: Array<{ lineId: string; quantity: number }>;
      buyer?: { shopName: string; phone: string; address: string };
    },
    executor: DbExecutor,
  ) {
    const state = await this.loadBillState(bill, executor);
    this.assertExpectedVersion(state, input.expectedVersionNumber);
    const issuedOn = businessDateOf(new Date());
    const current = state.letterhead.buyer;
    const buyer = input.buyer
      ? {
          ...current,
          shop_name: input.buyer.shopName,
          phone: input.buyer.phone,
          address: input.buyer.address,
        }
      : current;
    assertQuantitiesFit(state.items, state.standing, input.lines, "correct");
    const plan = planCorrect({
      currentItems: state.items,
      standing: state.standing,
      newQuantities: new Map(input.lines.map((line) => [line.lineId, line.quantity])),
      buyerChanged:
        buyer.shop_name !== current.shop_name ||
        buyer.phone !== current.phone ||
        buyer.address !== current.address,
      placeOfSupply: state.placeOfSupply,
      creditNoteKind: await this.creditNoteKindFor(bill, issuedOn, executor),
      oldTotalPaise: bill.totalPaise,
    });
    if (!plan.ok) refuseArithmetic(plan);
    return { state, plan, buyer, issuedOn };
  }

  private async planNoteFor(
    bill: SelectBill,
    input: {
      expectedVersionNumber: number;
      kind: NoteDraft["kind"];
      lines: Array<{ lineId: string; quantity: number }>;
    },
    executor: DbExecutor,
  ) {
    const state = await this.loadBillState(bill, executor);
    this.assertExpectedVersion(state, input.expectedVersionNumber);
    const issuedOn = businessDateOf(new Date());
    if (input.kind === "gst_credit_note") {
      const deadline = await this.deadlineService.isGstCreditNoteAllowed(
        { billDate: bill.billDate, onDate: issuedOn },
        executor,
      );
      if (!deadline.allowed) {
        throw ledgerRefusal(
          "gst_credit_note_deadline_passed",
          `The GST Credit Note deadline for this Bill was ${deadline.deadlineDate}. Raise a Commercial Credit Note instead.`,
          { deadlineDate: deadline.deadlineDate },
        );
      }
    }
    if (input.kind === "debit_note") {
      assertQuantitiesFit(state.items, state.standing, input.lines, "debit_note");
    }
    const plan = planRaisedNote({
      kind: input.kind,
      picks: input.lines,
      currentItems: state.items,
      standing: state.standing,
      placeOfSupply: state.placeOfSupply,
    });
    if (!plan.ok) refuseArithmetic(plan);
    return { state, draft: plan.note, issuedOn };
  }

  // A Book Now whose GatePass is still active: its lines for the Bill's Varieties, locked in
  // variety id order. Anything else restores nothing.
  private async lockRestorableStock(
    order: SelectOrder | undefined,
    state: BillState,
    transaction: DbExecutor,
  ): Promise<SelectGatepassItem[]> {
    if (order?.type !== "book_now" || !order.gatepassId) return [];
    // Locked before its lines, the order a handover takes them in, so a handover cannot close it
    // between this check and the restore.
    const gatepass = await lockGatepassRow(order.gatepassId, "update", transaction);
    if (gatepass?.status !== "active") return [];
    const varietyIds = [...new Set(state.items.map((item) => item.varietyId))].sort();
    return lockGatepassItemsForVarieties(gatepass.id, varietyIds, transaction);
  }

  // Lowers sold qty by each line's remaining uncredited qty, capped at the order line's qty (and
  // at what is still sold).
  private async restoreStock(
    order: SelectOrder | undefined,
    state: BillState,
    stockItems: SelectGatepassItem[],
    transaction: DbExecutor,
  ): Promise<boolean> {
    if (!order || stockItems.length === 0) return false;
    const orderItems = await listOrderItemsByOrderId(order.id, transaction);
    const orderQtyById = new Map(orderItems.map((item) => [item.id, item.quantity]));
    const stockByVarietyId = new Map(stockItems.map((item) => [item.varietyId, item]));
    const standingById = new Map(state.standing.lines.map((line) => [line.lineId, line]));
    let restored = false;
    for (const item of state.items) {
      const stock = stockByVarietyId.get(item.varietyId);
      const orderQty = item.orderItemId ? orderQtyById.get(item.orderItemId) : undefined;
      if (!stock || orderQty === undefined) continue;
      const quantity = Math.min(
        standingById.get(item.id)?.remainingQty ?? 0,
        orderQty,
        stock.soldQty,
      );
      if (quantity <= 0) continue;
      const updated = await restoreSoldQtyOnCancellation(stock.id, quantity, transaction);
      if (!updated) throw internalError(`GatePass stock moved under lock: ${item.varietyId}`);
      restored = true;
    }
    return restored;
  }

  // Order status cancelled and a new order version whose header carries the previous Route stamp.
  private async markOrderCancelled(
    order: SelectOrder,
    actorProfileId: string,
    reason: string,
    transaction: DbExecutor,
  ): Promise<void> {
    const latestVersion = await getLatestOrderVersion(order.id, transaction);
    if (!latestVersion) throw internalError(`Order ${order.id} has no version`);
    const cancelled = await updateOrder(
      order.id,
      { status: "cancelled", cancelledAt: new Date(), cancelledBy: actorProfileId },
      transaction,
    );
    await insertOrderVersion(
      {
        orderId: order.id,
        versionNumber: latestVersion.versionNumber + 1,
        header: { ...cancelled, route: routeStampFromHeader(latestVersion.header) },
        items: await listOrderItemsByOrderId(order.id, transaction),
        reason,
        actorId: actorProfileId,
      },
      transaction,
    );
  }

  // Merges repeated Varieties, then checks every line: a whole qty from 1 that fits int4, a
  // sellable Variety, a Route price on this Route and a tax period covering `day`. Every failure
  // is collected so one bad line refuses the whole Bill at once.
  private async resolveBasket(
    lines: Array<{ varietyId: string; quantity: number }>,
    routeId: string,
    day: string,
    executor: DbExecutor = db,
  ): Promise<ResolvedBasket> {
    const badLines: RaiseBillBadLine[] = [];
    const quantityByVarietyId = new Map<string, number>();
    const badQtyIds = new Set<string>();
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) badQtyIds.add(line.varietyId);
      quantityByVarietyId.set(
        line.varietyId,
        (quantityByVarietyId.get(line.varietyId) ?? 0) + line.quantity,
      );
    }
    for (const [varietyId, quantity] of quantityByVarietyId) {
      if (quantity > MAX_INT4) badQtyIds.add(varietyId);
    }
    for (const varietyId of badQtyIds) {
      badLines.push({ varietyId, reason: "bad_qty" });
      quantityByVarietyId.delete(varietyId);
    }

    const varietyIds = [...quantityByVarietyId.keys()];
    const varieties = await listSellableVarietiesByIds(varietyIds, executor);
    const varietyById = new Map(varieties.map((variety) => [variety.id, variety]));
    const prices = await this.routeService.listPricesForRoute(routeId, executor);
    const priceByVarietyId = new Map(prices.map((price) => [price.varietyId, price.pricePaise]));
    const taxFacts = await this.varietyTaxPeriodService.getCoveringTaxFacts(
      { varietyIds: varieties.map((variety) => variety.id), day },
      executor,
    );

    const resolved: ResolvedLine[] = [];
    let basketQuantity = 0;
    let basketAmount = 0n;
    for (const [varietyId, quantity] of quantityByVarietyId) {
      const variety = varietyById.get(varietyId);
      if (!variety) {
        badLines.push({ varietyId, reason: "unknown_variety" });
        continue;
      }
      const routePricePaise = priceByVarietyId.get(varietyId);
      const facts = taxFacts.get(varietyId);
      if (routePricePaise === undefined) badLines.push({ varietyId, reason: "no_route_price" });
      if (!facts) badLines.push({ varietyId, reason: "no_tax_period" });
      if (routePricePaise === undefined || !facts) continue;
      const amountWithTax = BigInt(routePricePaise) * BigInt(quantity) * 2n;
      if (basketQuantity + quantity > MAX_INT4 || basketAmount + amountWithTax > MAX_SAFE_AMOUNT) {
        badLines.push({ varietyId, reason: "bad_qty" });
        continue;
      }
      basketQuantity += quantity;
      basketAmount += amountWithTax;
      resolved.push({
        varietyId,
        sku: variety.sku,
        name: variety.name,
        unit: variety.unit,
        quantity,
        routePricePaise,
        hsn: facts.hsn,
        exempt: facts.exempt,
        gstRateBps: facts.gstRateBps,
      });
    }
    return { lines: resolved, badLines };
  }
}

export default AdminBillService;
export type {
  AdminBillListener,
  AdminBillOutcome,
  BillLockHook,
  BillPaper,
  CancelBillResult,
  CorrectPreview,
  CorrectResult,
  PreOrderPaper,
  RaiseBillPreview,
  RaiseBillResult,
  RaiseNotePreview,
  RaiseNoteResult,
};
