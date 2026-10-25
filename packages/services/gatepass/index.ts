import {
  createGatepassWithItems,
  getActiveGatepassBySalesmanAndDate,
  getAllotmentMatrixForDate,
  getDiscrepancyGatepassesForDate,
  getEndOfDayTotalsForDate,
  getGatepassById,
  getGatepassHistoryForSalesman,
  getGatepassItemById,
  getGatepassWithItemsForSalesmanAndDate,
  incrementSoldQtyIfAvailable,
  listGatepassesForDate,
  recordReturnedQtyForItem,
  restoreSoldQtyOnCancellation,
  submitHandoverForGatepass,
  updateGatepassStatus,
  withSellableQty,
  type AllotmentMatrixRow,
  type DiscrepancyGatepassRow,
  type GatepassEndOfDayTotals,
  type GatepassHistoryRow,
  type GatepassItemWithSellable,
  type GatepassWithItems,
} from "@repo/database/queries/gatepass";
import { getProfileById } from "@repo/database/queries/auth";
import { toIstBusinessDate } from "@repo/database/queries/shared/business-date";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import type { SelectGatepass, SelectGatepassItem } from "@repo/database/schema";

import { badRequest, conflict, forbidden, notFound } from "../errors";
import { changedFields, recordAudit } from "../shared/audit";
import {
  allotGatepassInputSchema,
  closeGatepassInputSchema,
  flagGatepassInputSchema,
  recordReturnInputSchema,
  recordSaleInputSchema,
  submitHandoverInputSchema,
  type AllotGatepassInput,
  type CloseGatepassInput,
  type FlagGatepassInput,
  type RecordReturnInput,
  type RecordSaleInput,
  type SubmitHandoverInput,
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
    // A salesman can be re-allotted a fresh gatepass on the same day, but only once their
    // current one is no longer active (handed over / closed). Block only on an active gatepass.
    const activeGatepass = await getActiveGatepassBySalesmanAndDate(
      parsedInput.salesmanId,
      parsedInput.businessDate,
    );
    if (activeGatepass) {
      throw conflict(
        `Salesman ${parsedInput.salesmanId} already has an active gatepass on ${parsedInput.businessDate}`,
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
          `Salesman ${parsedInput.salesmanId} already has an active gatepass on ${parsedInput.businessDate}`,
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
    const gatepassWithItems = await getGatepassWithItemsForSalesmanAndDate(
      salesmanId,
      businessDate,
    );
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

  public async recordSale(input: RecordSaleInput): Promise<GatepassItemWithSellable> {
    const parsedInput = recordSaleInputSchema.parse(input);
    const updatedItem = await incrementSoldQtyIfAvailable(
      parsedInput.gatepassItemId,
      parsedInput.quantity,
    );
    if (!updatedItem) {
      throw conflict("Insufficient gatepass quantity available for this sale");
    }
    return withSellableQty(updatedItem);
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

  public async recordReturn(
    input: RecordReturnInput,
    actorProfileId: string,
  ): Promise<GatepassItemWithSellable> {
    const parsedInput = recordReturnInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const itemBefore = await getGatepassItemById(parsedInput.gatepassItemId, transaction);
      const updatedItem = await recordReturnedQtyForItem(
        parsedInput.gatepassItemId,
        parsedInput.returnedQty,
        transaction,
      );
      if (!itemBefore || !updatedItem) {
        throw notFound(`Gatepass item ${parsedInput.gatepassItemId} not found`);
      }
      const returnedChange = changedFields(itemBefore, updatedItem, ["returnedQty"]);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "updated",
          entityType: "gatepass",
          entityId: updatedItem.gatepassId,
          payload: Object.keys(returnedChange).length
            ? { varietyId: updatedItem.varietyId, ...returnedChange }
            : {},
        },
        transaction,
      );
      return withSellableQty(updatedItem);
    });
  }

  public async submitHandover(input: SubmitHandoverInput): Promise<GatepassWithItems> {
    const parsedInput = submitHandoverInputSchema.parse(input);
    const outcome = await runInTransaction(async (transaction) => {
      const handoverOutcome = await submitHandoverForGatepass(
        parsedInput.gatepassId,
        parsedInput.salesmanId,
        parsedInput.items,
        transaction,
      );
      if (handoverOutcome.status === "success") {
        await recordAudit(
          {
            actorId: parsedInput.salesmanId,
            action: "handover_submitted",
            entityType: "gatepass",
            entityId: parsedInput.gatepassId,
          },
          transaction,
        );
      }
      return handoverOutcome;
    });

    if (outcome.status === "not_found") {
      throw notFound(`Gatepass ${parsedInput.gatepassId} not found`);
    }
    if (outcome.status === "forbidden") {
      throw forbidden("This gatepass does not belong to you");
    }
    if (outcome.status === "not_active") {
      throw conflict(`Gatepass ${parsedInput.gatepassId} is not active`);
    }
    if (outcome.status === "invalid") {
      throw badRequest(outcome.message);
    }
    return outcome.gatepass;
  }

  // Verify: approves a handed-over GatePass with no discrepancy.
  public async closeGatepass(
    gatepassId: string,
    input: CloseGatepassInput,
  ): Promise<SelectGatepass | undefined> {
    const parsedInput = closeGatepassInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const gatepass = await getGatepassById(gatepassId, transaction);
      if (!gatepass) return undefined;
      if (gatepass.status !== "pending_verification") {
        throw conflict("Only gatepasses awaiting verification can be approved");
      }
      const closedGatepass = await updateGatepassStatus(
        gatepassId,
        {
          status: "closed",
          closedBy: parsedInput.closedBy,
          closedAt: new Date(),
          hasDiscrepancy: false,
          discrepancyReason: null,
          notes: parsedInput.notes,
        },
        transaction,
      );
      await recordAudit(
        {
          actorId: parsedInput.closedBy,
          action: "closed",
          entityType: "gatepass",
          entityId: gatepassId,
        },
        transaction,
      );
      return closedGatepass;
    });
  }

  public async flagGatepassDiscrepancy(
    gatepassId: string,
    input: FlagGatepassInput,
  ): Promise<SelectGatepass | undefined> {
    const parsedInput = flagGatepassInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const gatepass = await getGatepassById(gatepassId, transaction);
      if (!gatepass) return undefined;
      if (gatepass.status !== "pending_verification") {
        throw conflict("Only gatepasses awaiting verification can be flagged");
      }
      const flaggedGatepass = await updateGatepassStatus(
        gatepassId,
        {
          status: "closed",
          closedBy: parsedInput.closedBy,
          closedAt: new Date(),
          hasDiscrepancy: true,
          discrepancyReason: parsedInput.reason,
          notes: parsedInput.notes,
        },
        transaction,
      );
      if (flaggedGatepass) {
        await recordAudit(
          {
            actorId: parsedInput.closedBy,
            action: "updated",
            entityType: "gatepass",
            entityId: gatepassId,
            payload: changedFields(gatepass, flaggedGatepass, [
              "status",
              "hasDiscrepancy",
              "discrepancyReason",
            ]),
          },
          transaction,
        );
      }
      return flaggedGatepass;
    });
  }

  public async getEndOfDayTotals(businessDate: string): Promise<GatepassEndOfDayTotals> {
    return getEndOfDayTotalsForDate(businessDate);
  }

  public async getDiscrepancies(businessDate: string): Promise<DiscrepancyGatepassRow[]> {
    return getDiscrepancyGatepassesForDate(businessDate);
  }
}

export default GatepassService;
