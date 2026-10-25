import {
  getBillDetailById,
  getBillDetailByNumber,
  getBillDetailByOrderId,
  listBills,
  type BillDetail,
  type BillListRow,
} from "@repo/database/queries/bills";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";

import { notFound } from "../errors";
import { listBillsInputSchema, type ListBillsInput } from "./model";

// Read side of the Bill (the paper). Issue, Correct, Cancel and Notes arrive with Specs F and G.
class BillService {
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

  public async listBills(input: ListBillsInput): Promise<PaginatedResult<BillListRow>> {
    const parsedInput = listBillsInputSchema.parse(input);
    return listBills(parsedInput, parsedInput);
  }
}

export default BillService;
