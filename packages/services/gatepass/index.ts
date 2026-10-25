import { db } from "@repo/database";
import {
  createGatepassWithItems,
  getActiveGatepassBySalesmanAndDate,
  getActiveGatepassWithRoute,
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
  type ActiveGatepassWithRoute,
  type AllotmentMatrixRow,
  type DiscrepancyGatepassRow,
  type GatepassEndOfDayTotals,
  type GatepassHistoryRow,
  type GatepassItemWithSellable,
  type GatepassWithItems,
  type GatepassWithRoute,
  type GatepassWithRouteAndItems,
} from "@repo/database/queries/gatepass";
import { listPricesForRoute, listVarietyLabels, lockRouteRow } from "@repo/database/queries/routes";
import { getProfileById } from "@repo/database/queries/auth";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
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

const activeGatepassConstraint = "gatepasses_salesman_active_business_date_unique";

function isDuplicateGatepassError(caughtError: unknown): boolean {
  return violatedUniqueConstraint(caughtError) === activeGatepassConstraint;
}

class GatepassService {
  public getCurrentBusinessDate(): string {
    return businessDateOf(new Date());
  }

  // The salesman's GatePass with status `active` on today's Asia/Kolkata business date, with its
  // Route. Handed-over and closed GatePasses are not Active. Pass the caller's transaction to
  // resolve it inside that transaction.
  public async getActiveGatepassForSalesman(
    salesmanId: string,
    executor: DbExecutor = db,
  ): Promise<ActiveGatepassWithRoute | null> {
    const activeGatepass = await getActiveGatepassWithRoute(
      salesmanId,
      businessDateOf(new Date()),
      executor,
    );
    return activeGatepass ?? null;
  }

  // The Route is set here once and never changed. Every allotted variety needs a Route price on it.
  public async allotGatepass(input: AllotGatepassInput): Promise<GatepassWithRouteAndItems> {
    const parsedInput = allotGatepassInputSchema.parse(input);
    const alreadyActive = () =>
      conflict(
        `Salesman ${parsedInput.salesmanId} already has an active gatepass on ${parsedInput.businessDate}`,
      );
    try {
      return await runInTransaction(async (transaction) => {
        // FOR SHARE waits on a concurrent Hide, so a hidden Route never gets an Active GatePass.
        const route = await lockRouteRow(parsedInput.routeId, "share", transaction);
        if (!route) throw notFound(`Route ${parsedInput.routeId} not found`);
        if (route.deletedAt) {
          throw conflict(`Route ${route.name} is hidden. Pick another Route.`);
        }

        const pricedVarietyIds = new Set(
          (await listPricesForRoute(route.id, transaction)).map((price) => price.varietyId),
        );
        const unpricedVarietyIds = parsedInput.items
          .map((item) => item.varietyId)
          .filter((varietyId) => !pricedVarietyIds.has(varietyId));
        if (unpricedVarietyIds.length > 0) {
          const labels = await listVarietyLabels(unpricedVarietyIds, transaction);
          const named = labels.length ? labels.map((row) => row.label) : unpricedVarietyIds;
          throw badRequest(`No price on Route ${route.name} for: ${named.join(", ")}`);
        }

        // A salesman can be re-allotted a fresh gatepass on the same day, but only once their
        // current one is no longer active (handed over / closed).
        const activeGatepass = await getActiveGatepassBySalesmanAndDate(
          parsedInput.salesmanId,
          parsedInput.businessDate,
          transaction,
        );
        if (activeGatepass) throw alreadyActive();

        const created = await createGatepassWithItems(
          {
            salesmanId: parsedInput.salesmanId,
            routeId: route.id,
            businessDate: parsedInput.businessDate,
            issuedBy: parsedInput.issuedBy,
            status: "active",
          },
          parsedInput.items,
          transaction,
        );
        await recordAudit(
          {
            actorId: parsedInput.issuedBy,
            action: "allotted",
            entityType: "gatepass",
            entityId: created.gatepass.id,
            payload: {
              salesmanId: parsedInput.salesmanId,
              businessDate: parsedInput.businessDate,
              routeId: route.id,
              items: parsedInput.items,
            },
          },
          transaction,
        );
        return {
          gatepass: { ...created.gatepass, routeName: route.name, routeCode: route.code },
          items: created.items,
        };
      });
    } catch (insertError) {
      if (isDuplicateGatepassError(insertError)) throw alreadyActive();
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
    | (GatepassWithRouteAndItems & { issuedByName: string | null; closedByName: string | null })
    | undefined
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

  public async listGatepassesForDate(businessDate: string): Promise<GatepassWithRoute[]> {
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
