import { db } from "@repo/database";
import {
  countActiveGatepassesOnRoute,
  countOpenPreordersOnRoute,
  createRoute,
  deleteRoutePrice,
  findRouteByNameIgnoringCase,
  getRouteById,
  getRoutePrice,
  listPricesForRoute,
  listRouteChoices,
  listRouteCodes,
  listRoutePriceForm,
  listRoutes,
  lockRouteNaming,
  lockRouteRow,
  updateRoute,
  upsertRoutePrice,
  varietyExists,
  type RouteChoice,
  type RouteListRow,
  type RoutePriceFormRow,
} from "@repo/database/queries/routes";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectRoute, SelectRoutePrice } from "@repo/database/schema";

import { conflict, notFound } from "../errors";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import { nextRouteCode } from "./code";
import {
  clearRoutePriceInputSchema,
  createRouteInputSchema,
  listRouteChoicesInputSchema,
  listRoutesInputSchema,
  routeIdSchema,
  routeStatusSchema,
  setRoutePriceInputSchema,
  updateRouteInputSchema,
  varietyIdSchema,
  type ClearRoutePriceInput,
  type CreateRouteInput,
  type ListRouteChoicesInput,
  type ListRoutesInput,
  type RouteStatus,
  type SetRoutePriceInput,
  type UpdateRouteInput,
} from "./model";

const routeNameConstraint = "routes_name_unique";

export interface RouteWithPriceForm {
  route: SelectRoute;
  varieties: RoutePriceFormRow[];
}

function routeNameTaken(name: string) {
  return conflict(`A Route named "${name}" already exists`);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Routes and Route prices. A missing Route price means the variety is unsellable on that Route.
class RouteService {
  public async listRoutes(input: ListRoutesInput): Promise<RouteListRow[]> {
    const parsedInput = listRoutesInputSchema.parse(input);
    return listRoutes({
      search: parsedInput.search || undefined,
      includeHidden: parsedInput.includeHidden,
    });
  }

  public async getRoute(routeId: string): Promise<RouteWithPriceForm> {
    const parsedRouteId = routeIdSchema.parse(routeId);
    const route = await getRouteById(parsedRouteId);
    if (!route) throw notFound(`Route ${parsedRouteId} not found`);
    const varieties = await listRoutePriceForm(parsedRouteId);
    return { route, varieties };
  }

  // Read helpers for checkout and Admin Raise Bill; pass the caller's transaction to read the
  // price inside it.
  public async listPricesForRoute(
    routeId: string,
    executor: DbExecutor = db,
  ): Promise<SelectRoutePrice[]> {
    return listPricesForRoute(routeIdSchema.parse(routeId), executor);
  }

  public async getRoutePrice(
    routeId: string,
    varietyId: string,
    executor: DbExecutor = db,
  ): Promise<SelectRoutePrice | null> {
    const routePrice = await getRoutePrice(
      routeIdSchema.parse(routeId),
      varietyIdSchema.parse(varietyId),
      executor,
    );
    return routePrice ?? null;
  }

  public async listRouteChoices(input: ListRouteChoicesInput = {}): Promise<RouteChoice[]> {
    const parsedInput = listRouteChoicesInputSchema.parse(input);
    return listRouteChoices(parsedInput.excludeRouteId);
  }

  public async createRoute(input: CreateRouteInput, actorProfileId: string): Promise<SelectRoute> {
    const parsedInput = createRouteInputSchema.parse(input);
    try {
      return await runInTransaction(async (transaction) => {
        await lockRouteNaming(transaction);
        if (await findRouteByNameIgnoringCase(parsedInput.name, undefined, transaction)) {
          throw routeNameTaken(parsedInput.name);
        }
        const code = nextRouteCode(parsedInput.name, await listRouteCodes(transaction));
        const newRoute = { ...parsedInput, code };
        const route = await createRoute(newRoute, transaction);
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "created",
            entityType: "route",
            entityId: route.id,
            payload: createdFields(newRoute),
          },
          transaction,
        );
        return route;
      });
    } catch (error) {
      if (violatedUniqueConstraint(error) === routeNameConstraint) {
        throw routeNameTaken(parsedInput.name);
      }
      throw error;
    }
  }

  // Name and delivery state; the Route code never changes.
  public async updateRoute(
    routeId: string,
    changes: UpdateRouteInput,
    actorProfileId: string,
  ): Promise<SelectRoute> {
    const parsedRouteId = routeIdSchema.parse(routeId);
    const parsedChanges = updateRouteInputSchema.parse(changes);
    if (parsedChanges.name === undefined && parsedChanges.deliveryState === undefined) {
      const route = await getRouteById(parsedRouteId);
      if (!route) throw notFound(`Route ${parsedRouteId} not found`);
      return route;
    }
    try {
      return await runInTransaction(async (transaction) => {
        if (parsedChanges.name !== undefined) {
          await lockRouteNaming(transaction);
          if (await findRouteByNameIgnoringCase(parsedChanges.name, parsedRouteId, transaction)) {
            throw routeNameTaken(parsedChanges.name);
          }
        }
        const before = await getRouteById(parsedRouteId, transaction);
        if (!before) throw notFound(`Route ${parsedRouteId} not found`);
        const after = await updateRoute(parsedRouteId, parsedChanges, transaction);
        if (!after) throw notFound(`Route ${parsedRouteId} not found`);
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "updated",
            entityType: "route",
            entityId: parsedRouteId,
            payload: changedFields(before, after, ["name", "deliveryState"]),
          },
          transaction,
        );
        return after;
      });
    } catch (error) {
      if (violatedUniqueConstraint(error) === routeNameConstraint && parsedChanges.name) {
        throw routeNameTaken(parsedChanges.name);
      }
      throw error;
    }
  }

  // Never gated: Inactive is a label only.
  public async setRouteStatus(
    routeId: string,
    status: RouteStatus,
    actorProfileId: string,
  ): Promise<SelectRoute> {
    const parsedRouteId = routeIdSchema.parse(routeId);
    const parsedStatus = routeStatusSchema.parse(status);
    return runInTransaction(async (transaction) => {
      const before = await getRouteById(parsedRouteId, transaction);
      if (!before) throw notFound(`Route ${parsedRouteId} not found`);
      if (before.status === parsedStatus) return before;
      const after = await updateRoute(parsedRouteId, { status: parsedStatus }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: parsedStatus === "active" ? "activated" : "deactivated",
          entityType: "route",
          entityId: parsedRouteId,
        },
        transaction,
      );
      return after!;
    });
  }

  // A soft delete that cannot be undone. Refused while the Route has an Active GatePass (any date)
  // or an open Pre-order.
  public async hideRoute(routeId: string, actorProfileId: string): Promise<SelectRoute> {
    const parsedRouteId = routeIdSchema.parse(routeId);
    return runInTransaction(async (transaction) => {
      const route = await lockRouteRow(parsedRouteId, "update", transaction);
      if (!route) throw notFound(`Route ${parsedRouteId} not found`);
      if (route.deletedAt) return route;
      const activeGatepassCount = await countActiveGatepassesOnRoute(parsedRouteId, transaction);
      const openPreorderCount = await countOpenPreordersOnRoute(parsedRouteId, transaction);
      if (activeGatepassCount > 0 || openPreorderCount > 0) {
        throw conflict(
          `${route.name} has ${plural(activeGatepassCount, "Active GatePass", "Active GatePasses")} and ${plural(openPreorderCount, "open Pre-order", "open Pre-orders")}. Close them before deleting the Route.`,
        );
      }
      const hidden = await updateRoute(parsedRouteId, { deletedAt: new Date() }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deleted",
          entityType: "route",
          entityId: parsedRouteId,
        },
        transaction,
      );
      return hidden!;
    });
  }

  // Insert or overwrite the one price for (Route, variety).
  public async setRoutePrice(
    input: SetRoutePriceInput,
    actorProfileId: string,
  ): Promise<SelectRoutePrice> {
    const parsedInput = setRoutePriceInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      if (!(await getRouteById(parsedInput.routeId, transaction))) {
        throw notFound(`Route ${parsedInput.routeId} not found`);
      }
      if (!(await varietyExists(parsedInput.varietyId, transaction))) {
        throw notFound(`Variety ${parsedInput.varietyId} not found`);
      }
      const before = await getRoutePrice(parsedInput.routeId, parsedInput.varietyId, transaction);
      if (before?.pricePaise === parsedInput.pricePaise) return before;
      const routePrice = await upsertRoutePrice(parsedInput, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: before ? "updated" : "created",
          entityType: "route_price",
          entityId: routePrice.id,
          payload: {
            routeId: parsedInput.routeId,
            varietyId: parsedInput.varietyId,
            pricePaise: { from: before?.pricePaise ?? null, to: parsedInput.pricePaise },
          },
        },
        transaction,
      );
      return routePrice;
    });
  }

  // Makes the variety unsellable on the Route. Clearing a missing price is a no-op.
  public async clearRoutePrice(input: ClearRoutePriceInput, actorProfileId: string): Promise<void> {
    const parsedInput = clearRoutePriceInputSchema.parse(input);
    await runInTransaction(async (transaction) => {
      const removed = await deleteRoutePrice(
        parsedInput.routeId,
        parsedInput.varietyId,
        transaction,
      );
      if (!removed) return;
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deleted",
          entityType: "route_price",
          entityId: removed.id,
          payload: {
            routeId: removed.routeId,
            varietyId: removed.varietyId,
            pricePaise: removed.pricePaise,
          },
        },
        transaction,
      );
    });
  }
}

export default RouteService;
export type { RouteChoice, RouteListRow, RoutePriceFormRow };
export { INDIAN_STATES, type IndianStateName } from "../shared/indian-states";
export { routeNameSchema } from "./model";
