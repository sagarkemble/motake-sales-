import { getCustomerById, getCustomerWithRouteById } from "@repo/database/queries/customers";
import {
  getCustomerLedgerTotals,
  getOpeningBalanceEntry,
  hasOpeningBalance,
  listCustomerLedgerRows,
  type LedgerRowRecord,
  type LedgerRowType,
} from "@repo/database/queries/ledger";
import { listOpenPreordersForCustomer } from "@repo/database/queries/orders";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";

import { ledgerRefusal, notFound } from "../errors";
import LedgerService, { toBalance } from "../ledger";
import {
  addOpeningBalanceInputSchema,
  listLedgerRowsInputSchema,
  type AddOpeningBalanceInput,
  type LedgerOpenTarget,
  type LedgerRow,
  type LedgerSummary,
  type ListLedgerRowsInput,
  type OpenPreorder,
  type OpeningBalanceResult,
  type OpeningPaper,
} from "./model";

// Generic titles keep the table short; Note rows name their kind.
const ROW_LABELS: Record<LedgerRowType, { detailsTitle: string; typeLabel: string }> = {
  opening_balance: { detailsTitle: "Opening balance", typeLabel: "Opening balance" },
  bill: { detailsTitle: "Bill raised", typeLabel: "Bill" },
  payment: { detailsTitle: "Payment received", typeLabel: "Payment" },
  refund: { detailsTitle: "Refund paid", typeLabel: "Refund" },
  gst_credit_note: { detailsTitle: "GST Credit Note", typeLabel: "GST Credit Note" },
  commercial_credit_note: {
    detailsTitle: "Commercial Credit Note",
    typeLabel: "Commercial Credit Note",
  },
  debit_note: { detailsTitle: "Debit Note", typeLabel: "Debit Note" },
};

// Payment adjusted and Refund adjusted rows open the Payment or Refund they adjust.
function openTargetOf(row: LedgerRowRecord): LedgerOpenTarget {
  if (row.noteId && row.noteBillId) {
    return { kind: "note", billId: row.noteBillId, noteId: row.noteId };
  }
  if (row.billId) return { kind: "bill", billId: row.billId };
  if (row.paymentId) return { kind: "payment", paymentId: row.paymentId };
  if (row.refundId) return { kind: "refund", refundId: row.refundId };
  return { kind: "opening_balance", entryId: row.id };
}

function toLedgerRow(row: LedgerRowRecord): LedgerRow {
  return {
    id: row.id,
    rowType: row.rowType,
    entryType: row.entryType,
    date: businessDateOf(row.occurredAt),
    occurredAt: row.occurredAt,
    ...ROW_LABELS[row.rowType],
    number: row.entryType === "opening_balance" ? null : row.number,
    debitPaise: row.side === "debit" ? row.amountPaise : null,
    creditPaise: row.side === "credit" ? row.amountPaise : null,
    cancelled: row.entryType === "bill" && row.billCancelled,
    reason: row.reason,
    open: openTargetOf(row),
  };
}

// Start of an Asia/Kolkata day.
function openingInstantOf(openingDate: string): Date {
  return new Date(`${openingDate}T00:00:00+05:30`);
}

// The Admin Ledger (Spec G): one Customer's Ledger rows with filters and pages, the footer over
// the whole Ledger, the Open Pre-orders list beside it, and Opening balance add. Reads also work
// for a deactivated Customer; Opening balance add does not.
class CustomerLedgerService {
  private readonly ledgerService = new LedgerService();

  public async listRows(input: ListLedgerRowsInput): Promise<PaginatedResult<LedgerRow>> {
    const parsedInput = listLedgerRowsInputSchema.parse(input);
    const page = await listCustomerLedgerRows(parsedInput, parsedInput);
    return { ...page, items: page.items.map(toLedgerRow) };
  }

  // Footer and header facts, never changed by filters.
  public async getSummary(customerId: string): Promise<LedgerSummary> {
    const customer = await getCustomerWithRouteById(customerId);
    if (!customer) throw notFound(`Customer ${customerId} not found`);
    const totals = await getCustomerLedgerTotals(customerId);
    const openingPaise = totals.openingDebitPaise - totals.openingCreditPaise;
    const currentPaise = totals.currentDebitPaise - totals.currentCreditPaise;
    return {
      customer: {
        id: customer.id,
        shopName: customer.shopName,
        phone: customer.phone,
        status: customer.status,
        routeName: customer.routeName,
        routeCode: customer.routeCode,
      },
      footer: {
        opening: { debitPaise: totals.openingDebitPaise, creditPaise: totals.openingCreditPaise },
        currentTotal: {
          debitPaise: totals.currentDebitPaise,
          creditPaise: totals.currentCreditPaise,
        },
        closing: toBalance(openingPaise + currentPaise),
      },
      hasOpeningBalance: totals.hasOpeningBalance,
    };
  }

  // This Customer's unfulfilled Pre-orders, earliest first; not Ledger rows and never in the
  // footer.
  public async listOpenPreorders(customerId: string): Promise<OpenPreorder[]> {
    const today = businessDateOf(new Date());
    const rows = await listOpenPreordersForCustomer(customerId);
    return rows.map((row) => ({
      ...row,
      dueState:
        row.scheduledDate > today ? "upcoming" : row.scheduledDate === today ? "due" : "overdue",
    }));
  }

  // The view-only Opening paper (Spec H): side, amount, date, reason and who set it; null when the
  // Customer has no Opening balance. There is no Opening Correct.
  public async getOpeningPaper(customerId: string): Promise<OpeningPaper | null> {
    const row = await getOpeningBalanceEntry(customerId);
    if (!row) {
      if (!(await getCustomerById(customerId))) throw notFound(`Customer ${customerId} not found`);
      return null;
    }
    const { entry, actorName } = row;
    return {
      entryId: entry.id,
      side: entry.side === "debit" ? "pending" : "advance",
      amountPaise: entry.amountPaise,
      date: businessDateOf(entry.occurredAt),
      occurredAt: entry.occurredAt,
      reason: entry.reason,
      actorName,
    };
  }

  // Once per Customer, through Spec B's setOpeningBalance (which locks the Customer, refuses a
  // second one and writes the opening_set audit row). An optional past Opening date becomes the
  // row's posting time; the row still sorts first. No message is sent.
  public async addOpeningBalance(
    actorProfileId: string,
    input: AddOpeningBalanceInput,
  ): Promise<OpeningBalanceResult> {
    const parsedInput = addOpeningBalanceInputSchema.parse(input);
    const today = businessDateOf(new Date());
    if (parsedInput.openingDate && parsedInput.openingDate > today) {
      throw ledgerRefusal("opening_date_in_future", "The Opening date cannot be after today.", {
        openingDate: parsedInput.openingDate,
        today,
      });
    }
    return runInTransaction(async (transaction) => {
      // The Customer row is locked (and checked active) before the "already has one" check, so
      // only that case is refused opening_balance_exists; any other conflict surfaces as is.
      await this.ledgerService.lockBalance(parsedInput.customerId, transaction);
      if (await hasOpeningBalance(parsedInput.customerId, transaction)) {
        throw ledgerRefusal(
          "opening_balance_exists",
          "This Customer already has an Opening balance. It cannot be added twice.",
          { customerId: parsedInput.customerId },
        );
      }
      const posted = await this.ledgerService.setOpeningBalance(
        {
          customerId: parsedInput.customerId,
          direction: parsedInput.side,
          amountPaise: parsedInput.amountPaise,
          reason: parsedInput.reason,
          actorId: actorProfileId,
          occurredAt: parsedInput.openingDate
            ? openingInstantOf(parsedInput.openingDate)
            : undefined,
        },
        transaction,
      );
      return {
        entryId: posted.entryId,
        occurredAt: posted.occurredAt,
        balance: toBalance(posted.balanceAfterPaise),
      };
    });
  }
}

export default CustomerLedgerService;
export type { LedgerRow, LedgerSummary, OpenPreorder, OpeningBalanceResult, OpeningPaper };
