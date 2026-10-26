import { db } from "@repo/database";
import {
  getBillCustomerId,
  getBillDetailById,
  getBillDetailByNumber,
  getBillDetailByOrderId,
  insertBill,
  insertBillItems,
  insertBillVersion,
  listBills,
  type BillDetail,
  type BillLetterhead,
  type BillListRow,
} from "@repo/database/queries/bills";
import { isBillCancelled } from "@repo/database/queries/bills/cancelled";
import { getCustomerById } from "@repo/database/queries/customers";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";

import { notFound } from "../errors";
import LedgerService from "../ledger";
import SettingsService from "../settings";
import { assertCustomerActive, billTotalZeroRefusal } from "../shared/checkout";
import { computeBillTax, placeOfSupplyOf } from "../shared/tax-engine";
import {
  issueBillInputSchema,
  listBillsInputSchema,
  type IssueBillInput,
  type IssuedBill,
  type ListBillsInput,
} from "./model";

// The Bill (the paper). Issue runs here for checkout (Spec F) and Raise Bill (Spec G); Correct,
// Cancel and Notes are AdminBillService (Spec G).
class BillService {
  private readonly ledgerService = new LedgerService();
  private readonly settingsService = new SettingsService();

  public async getBill(billId: string): Promise<BillDetail> {
    const bill = await getBillDetailById(billId);
    if (!bill) throw notFound(`Bill ${billId} not found`);
    return bill;
  }

  public async getBillByNumber(number: string): Promise<BillDetail> {
    const bill = await getBillDetailByNumber(number.trim());
    if (!bill) throw notFound(`Bill ${number} not found`);
    return bill;
  }

  public async getBillForOrder(orderId: string): Promise<BillDetail | undefined> {
    return getBillDetailByOrderId(orderId);
  }

  // The one cancelled rule (Spec G): Bill Cancel's bill/cancelled audit row. Specs I and J ask here.
  public async isBillCancelled(billId: string, executor: DbExecutor = db): Promise<boolean> {
    return isBillCancelled(billId, executor);
  }

  // The Customer on the Bill's Ledger Bill debit; an office Bill has no other link (Spec I's IRN
  // pending and audit customer_id).
  public async getBillCustomerId(
    billId: string,
    executor: DbExecutor = db,
  ): Promise<string | null> {
    return getBillCustomerId(billId, executor);
  }

  public async listBills(input: ListBillsInput): Promise<PaginatedResult<BillListRow>> {
    const parsedInput = listBillsInputSchema.parse(input);
    return listBills(parsedInput, parsedInput);
  }

  // Runs in the caller's transaction, after the caller allocated the MB number (it never
  // allocates, so it can run under the Customer lock). Taxes the lines, stamps the letterhead,
  // writes the Bill, its lines and bill_versions v1 (reason Raised), then debits the Ledger.
  // Place of supply is the Route stamp's delivery state against the seller's state. The PDF is
  // drawn after commit (Spec J / L), so v1 has no pdf_key yet.
  public async issueBill(input: IssueBillInput, executor: DbExecutor): Promise<IssuedBill> {
    const parsedInput = issueBillInputSchema.parse(input);
    const seller = await this.settingsService.requireSellerSettings(executor);
    const customer = await getCustomerById(parsedInput.customerId, executor);
    assertCustomerActive(customer, parsedInput.customerId);

    const tax = computeBillTax(
      parsedInput.lines,
      placeOfSupplyOf(parsedInput.routeStamp.delivery_state, seller.state),
    );
    if (tax.totalPaise === 0) throw billTotalZeroRefusal();

    const letterhead: BillLetterhead = {
      route: parsedInput.routeStamp,
      buyer: {
        shop_name: customer.shopName,
        phone: customer.phone,
        address: customer.address,
        gstin: customer.gstin || null,
      },
      seller: { legal_name: seller.legalName, address: seller.address, gstin: seller.gstin },
    };
    const bill = await insertBill(
      {
        orderId: parsedInput.orderId,
        number: parsedInput.billNumber,
        legalType: tax.legalType,
        letterhead,
        totalQuantity: tax.totalQuantity,
        totalPaise: tax.totalPaise,
        taxablePaise: tax.taxablePaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        igstPaise: tax.igstPaise,
        roundOffPaise: tax.roundOffPaise,
        billDate: parsedInput.billDate,
      },
      executor,
    );
    const items = await insertBillItems(
      tax.lines.map((line) => ({
        billId: bill.id,
        varietyId: line.varietyId,
        orderItemId: line.orderItemId,
        stamp: line.stamp,
        quantity: line.quantity,
        routePricePaise: line.routePricePaise,
        exempt: line.exempt,
        gstRateBps: line.gstRateBps,
        taxablePaise: line.taxablePaise,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        igstPaise: line.igstPaise,
      })),
      executor,
    );
    // v1 items keep the live bill_items ids, so Notes can point at them.
    const version = await insertBillVersion(
      {
        billId: bill.id,
        versionNumber: 1,
        header: bill,
        items,
        reason: "Raised",
        actorId: parsedInput.actorId,
      },
      executor,
    );
    const debit = await this.ledgerService.post(
      {
        entryType: "bill",
        billId: bill.id,
        customerId: parsedInput.customerId,
        actorId: parsedInput.actorId,
        gatepassId: parsedInput.gatepassId,
        occurredAt: parsedInput.occurredAt,
        reason: parsedInput.reason,
      },
      executor,
    );
    return {
      bill,
      items,
      billVersionId: version.id,
      ledgerEntryId: debit.entryId,
      balanceAfterPaise: debit.balanceAfterPaise,
    };
  }
}

export default BillService;
export type { IssueBillInput, IssuedBill };
