import {
  createGatepassWithItems,
  getAllotmentMatrixForDate,
  getEndOfDayTotalsForDate,
  getGatepassBySalesmanAndDate,
  getGatepassById,
  getGatepassHistoryForSalesman,
  getGatepassWithItemsForSalesmanAndDate,
  incrementSoldQtyIfAvailable,
  listGatepassesForDate,
  listGatepassItemsByGatepassId,
  recordReturnedQtyForItem,
  restoreSoldQtyOnCancellation,
  updateGatepassStatus,
  type AllotmentMatrixRow,
  type GatepassEndOfDayTotals,
  type GatepassHistoryRow,
  type GatepassWithItems,
} from "@repo/database/queries/gatepass";
import { getProfileById } from "@repo/database/queries/auth";
import { toIstBusinessDate } from "@repo/database/queries/shared/business-date";
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

const GATEPASS_UNIQUE_VIOLATION_CODE = "23505";

function isDuplicateGatepassError(caughtError: unknown): boolean {
  return (
    typeof caughtError === "object" &&
    caughtError !== null &&
    "code" in caughtError &&
    (caughtError as { code: unknown }).code === GATEPASS_UNIQUE_VIOLATION_CODE
  );
}

class GatepassService {
  public getCurrentBusinessDate(): string {
    return toIstBusinessDate(new Date());
  }

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
    try {
      return await createGatepassWithItems(
        {
          salesmanId: parsedInput.salesmanId,
          businessDate: parsedInput.businessDate,
          issuedBy: parsedInput.issuedBy,
          status: "active",
        },
        parsedInput.items,
      );
    } catch (insertError) {
      if (isDuplicateGatepassError(insertError)) {
        throw conflict(
          `Gatepass already allotted for salesman ${parsedInput.salesmanId} on ${parsedInput.businessDate}`,
        );
      }
      throw insertError;
    }
  }

  public async getGatepassById(gatepassId: string): Promise<SelectGatepass | undefined> {
    return getGatepassById(gatepassId);
  }

  public async getGatepassForSalesmanAndDate(
    salesmanId: string,
    businessDate: string,
  ): Promise<
    (GatepassWithItems & { issuedByName: string | null; closedByName: string | null }) | undefined
  > {
    const gatepassWithItems = await getGatepassWithItemsForSalesmanAndDate(salesmanId, businessDate);
    if (!gatepassWithItems) return undefined;
    const issuedByProfile = await getProfileById(gatepassWithItems.gatepass.issuedBy);
    const closedByProfile = gatepassWithItems.gatepass.closedBy
      ? await getProfileById(gatepassWithItems.gatepass.closedBy)
      : null;
    return {
      ...gatepassWithItems,
      issuedByName: issuedByProfile?.name ?? null,
      closedByName: closedByProfile?.name ?? null,
    };
  }

  public async listGatepassesForDate(businessDate: string): Promise<SelectGatepass[]> {
    return listGatepassesForDate(businessDate);
  }

  public async getGatepassHistoryForSalesman(salesmanId: string): Promise<GatepassHistoryRow[]> {
    return getGatepassHistoryForSalesman(salesmanId);
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
