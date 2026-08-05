import {
  createGatepassWithItems,
  getAllotmentMatrixForDate,
  getEndOfDayTotalsForDate,
  getGatepassBySalesmanAndDate,
  getGatepassById,
  getGatepassWithItemsForSalesmanAndDate,
  incrementSoldQtyIfAvailable,
  listGatepassesForDate,
  listGatepassItemsByGatepassId,
  recordReturnedQtyForItem,
  restoreSoldQtyOnCancellation,
  updateGatepassStatus,
  type AllotmentMatrixRow,
  type GatepassEndOfDayTotals,
  type GatepassWithItems,
} from "@repo/database/queries/gatepass";
import type { SelectGatepass, SelectGatepassItem } from "@repo/database/schema";

import { conflict, notFound } from "../errors";
import {
  allotGatepassInputSchema,
  closeGatepassInputSchema,
  recordReturnInputSchema,
  recordSaleInputSchema,
  type AllotGatepassInput,
  type CloseGatepassInput,
  type RecordReturnInput,
  type RecordSaleInput,
} from "./model";

class GatepassService {
  public async allotGatepass(input: AllotGatepassInput): Promise<GatepassWithItems> {
    const parsedInput = allotGatepassInputSchema.parse(input);
    const existingGatepass = await getGatepassBySalesmanAndDate(
      parsedInput.salesmanId,
      parsedInput.businessDate,
    );
    if (existingGatepass) {
      throw conflict(
        `Gatepass already allotted for salesman ${parsedInput.salesmanId} on ${parsedInput.businessDate}`,
      );
    }
    return createGatepassWithItems(
      {
        salesmanId: parsedInput.salesmanId,
        businessDate: parsedInput.businessDate,
        issuedBy: parsedInput.issuedBy,
        status: "active",
      },
      parsedInput.items,
    );
  }

  public async getGatepassById(gatepassId: string): Promise<SelectGatepass | undefined> {
    return getGatepassById(gatepassId);
  }

  public async getGatepassForSalesmanAndDate(
    salesmanId: string,
    businessDate: string,
  ): Promise<GatepassWithItems | undefined> {
    return getGatepassWithItemsForSalesmanAndDate(salesmanId, businessDate);
  }

  public async listGatepassesForDate(businessDate: string): Promise<SelectGatepass[]> {
    return listGatepassesForDate(businessDate);
  }

  public async getAllotmentMatrix(businessDate: string): Promise<AllotmentMatrixRow[]> {
    return getAllotmentMatrixForDate(businessDate);
  }

  public async recordSale(input: RecordSaleInput): Promise<SelectGatepassItem> {
    const parsedInput = recordSaleInputSchema.parse(input);
    const updatedItem = await incrementSoldQtyIfAvailable(
      parsedInput.gatepassItemId,
      parsedInput.quantity,
    );
    if (!updatedItem) {
      throw conflict("Insufficient gatepass quantity available for this sale");
    }
    return updatedItem;
  }

  public async restoreSaleOnCancellation(
    gatepassItemId: string,
    quantity: number,
  ): Promise<SelectGatepassItem> {
    const restoredItem = await restoreSoldQtyOnCancellation(gatepassItemId, quantity);
    if (!restoredItem) {
      throw conflict("Cannot restore more quantity than was sold");
    }
    return restoredItem;
  }

  public async recordReturn(input: RecordReturnInput): Promise<SelectGatepassItem> {
    const parsedInput = recordReturnInputSchema.parse(input);
    const updatedItem = await recordReturnedQtyForItem(
      parsedInput.gatepassItemId,
      parsedInput.returnedQty,
    );
    if (!updatedItem) {
      throw notFound(`Gatepass item ${parsedInput.gatepassItemId} not found`);
    }
    return updatedItem;
  }

  public async closeGatepass(
    gatepassId: string,
    input: CloseGatepassInput,
  ): Promise<SelectGatepass | undefined> {
    const parsedInput = closeGatepassInputSchema.parse(input);
    const items = await listGatepassItemsByGatepassId(gatepassId);
    const hasDiscrepancy = items.some((item) => item.issuedQty !== item.soldQty + item.returnedQty);
    return updateGatepassStatus(gatepassId, {
      status: "closed",
      closedBy: parsedInput.closedBy,
      closedAt: new Date(),
      hasDiscrepancy,
      notes: parsedInput.notes,
    });
  }

  public async getEndOfDayTotals(businessDate: string): Promise<GatepassEndOfDayTotals> {
    return getEndOfDayTotalsForDate(businessDate);
  }
}

export default GatepassService;
