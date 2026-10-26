import {
  countOpenPreordersForCustomer,
  createCustomer,
  getCustomerById,
  getCustomerStats,
  getCustomerWithRouteById,
  lockCustomerRow,
  listActiveCustomersByIds,
  reactivateCustomer,
  searchCustomers,
  softDeleteCustomer,
  updateCustomer,
  type CustomerStats,
  type CustomerWithRoute,
} from "@repo/database/queries/customers";
import {
  countOpenOrdersByCustomerId,
  listOpenOrdersByCustomerId,
  type OpenOrderSummary,
} from "@repo/database/queries/orders";
import { getRouteById } from "@repo/database/queries/routes";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { InsertCustomer, SelectCustomer } from "@repo/database/schema";

import { badRequest, conflict, forbidden, notFound } from "../errors";
import GatepassService from "../gatepass";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import {
  buildObjectKey,
  buildPublicUrl,
  createPresignedUploadUrl,
  deleteObject,
} from "../uploads/r2-client";
import {
  createCustomerAsAdminInputSchema,
  createCustomerAsSalesmanInputSchema,
  createShopPhotoUploadUrlInputSchema,
  listCustomersForSalesmanInputSchema,
  listCustomersInputSchema,
  moveCustomerToRouteInputSchema,
  updateCustomerInputSchema,
  type CreateCustomerAsAdminInput,
  type CreateCustomerAsSalesmanInput,
  type CreateShopPhotoUploadUrlInput,
  type ListCustomersForSalesmanInput,
  type ListCustomersInput,
  type UpdateCustomerInput,
} from "./model";

const shopPhotoFolderName = "customers";
const customerAuditedFields = [
  "shopName",
  "contactName",
  "phone",
  "address",
  "notes",
  "shopPhotoKey",
  "gstin",
  "einvoicingRequired",
] as const;

const noActiveGatepass = () => badRequest("No Active GatePass");

export interface ShopPhotoUploadUrlResult {
  uploadUrl: string;
  imageKey: string;
  imageUrl: string;
}

function assertShopPhotoKeyBelongsToCreator(shopPhotoKey: string, creatorId: string): void {
  if (!shopPhotoKey.startsWith(`${shopPhotoFolderName}/${creatorId}/`)) {
    throw forbidden("This shop photo does not belong to the creating user");
  }
}

function assertShopPhotoKeyInCustomersFolder(shopPhotoKey: string): void {
  if (!shopPhotoKey.startsWith(`${shopPhotoFolderName}/`)) {
    throw forbidden("Invalid shop photo key");
  }
}

class CustomerService {
  private readonly gatepassService = new GatepassService();

  public async createShopPhotoUploadUrl(
    uploaderId: string,
    input: CreateShopPhotoUploadUrlInput,
  ): Promise<ShopPhotoUploadUrlResult> {
    const parsedInput = createShopPhotoUploadUrlInputSchema.parse(input);
    const imageKey = buildObjectKey(shopPhotoFolderName, uploaderId, parsedInput.fileName);
    const uploadUrl = await createPresignedUploadUrl(
      imageKey,
      parsedInput.contentType,
      parsedInput.contentLength,
    );
    return { uploadUrl, imageKey, imageUrl: buildPublicUrl(imageKey) };
  }

  // Admin picks any listed Route. Same phone on two Customers is allowed.
  public async createCustomerAsAdmin(
    input: CreateCustomerAsAdminInput,
    actorProfileId: string,
  ): Promise<SelectCustomer> {
    const parsedInput = createCustomerAsAdminInputSchema.parse(input);
    const { einvoicingRequired, gstin, ...details } = parsedInput;
    return runInTransaction(async (transaction) => {
      const route = await getRouteById(parsedInput.routeId, transaction);
      if (!route) throw notFound(`Route ${parsedInput.routeId} not found`);
      if (route.deletedAt) throw badRequest(`Route ${route.name} is deleted. Pick another Route.`);
      return this.insertCustomer(
        {
          ...details,
          gstin: gstin ?? null,
          einvoicingRequired: einvoicingRequired ?? Boolean(gstin),
        },
        actorProfileId,
        transaction,
      );
    });
  }

  // Saved on the Route of the salesman's Active GatePass; no GSTIN at the shop.
  public async createCustomerAsSalesman(
    input: CreateCustomerAsSalesmanInput,
    salesmanId: string,
  ): Promise<SelectCustomer> {
    const parsedInput = createCustomerAsSalesmanInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(
        salesmanId,
        transaction,
      );
      if (!activeGatepass) throw noActiveGatepass();
      return this.insertCustomer(
        {
          ...parsedInput,
          routeId: activeGatepass.route.id,
          gstin: null,
          einvoicingRequired: false,
        },
        salesmanId,
        transaction,
      );
    });
  }

  private async insertCustomer(
    newCustomer: Omit<InsertCustomer, "createdBy" | "shopPhotoUrl"> & { shopPhotoKey: string },
    actorProfileId: string,
    transaction: DbExecutor,
  ): Promise<SelectCustomer> {
    assertShopPhotoKeyBelongsToCreator(newCustomer.shopPhotoKey, actorProfileId);
    const values = {
      ...newCustomer,
      shopPhotoUrl: buildPublicUrl(newCustomer.shopPhotoKey),
      createdBy: actorProfileId,
    };
    const customer = await createCustomer(values, transaction);
    await recordAudit(
      {
        actorId: actorProfileId,
        action: "created",
        entityType: "customer",
        entityId: customer.id,
        customerId: customer.id,
        payload: createdFields(values),
      },
      transaction,
    );
    return customer;
  }

  public async getCustomerById(customerId: string): Promise<CustomerWithRoute | undefined> {
    return getCustomerWithRouteById(customerId);
  }

  // Not found when the Customer is inactive, off the salesman's Active GatePass Route, or the
  // salesman has no Active GatePass.
  public async getCustomerForSalesman(
    customerId: string,
    salesmanId: string,
  ): Promise<CustomerWithRoute> {
    const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(salesmanId);
    const customer = activeGatepass ? await getCustomerWithRouteById(customerId) : undefined;
    if (
      !activeGatepass ||
      !customer ||
      customer.routeId !== activeGatepass.route.id ||
      customer.deletedAt ||
      customer.status !== "active"
    ) {
      throw notFound(`Customer ${customerId} not found`);
    }
    return customer;
  }

  public async getCustomersByIds(customerIds: string[]): Promise<SelectCustomer[]> {
    return listActiveCustomersByIds(customerIds);
  }

  public async getCustomerStats(customerId: string): Promise<CustomerStats> {
    return getCustomerStats(customerId);
  }

  // Admin: every Route, optionally one. Search by name, contact, phone or address.
  public async searchCustomers(
    input: ListCustomersInput,
  ): Promise<PaginatedResult<CustomerWithRoute>> {
    const parsedInput = listCustomersInputSchema.parse(input);
    return searchCustomers(parsedInput.searchTerm, parsedInput, {
      includeInactive: parsedInput.includeInactive,
      routeId: parsedInput.routeId,
    });
  }

  // Salesman: active Customers on the Active GatePass Route only, by name, phone or address.
  public async searchCustomersForSalesman(
    input: ListCustomersForSalesmanInput,
    salesmanId: string,
  ): Promise<PaginatedResult<CustomerWithRoute>> {
    const parsedInput = listCustomersForSalesmanInputSchema.parse(input);
    const activeGatepass = await this.gatepassService.getActiveGatepassForSalesman(salesmanId);
    if (!activeGatepass) throw noActiveGatepass();
    return searchCustomers(parsedInput.searchTerm, parsedInput, {
      includeInactive: false,
      routeId: activeGatepass.route.id,
    });
  }

  // Refused while the Customer has an open Pre-order. Balance, Ledger, Bills, orders and
  // GatePasses stay as they are.
  public async moveCustomerToRoute(
    customerId: string,
    toRouteId: string,
    actorProfileId: string,
  ): Promise<SelectCustomer> {
    const parsedInput = moveCustomerToRouteInputSchema.parse({ customerId, toRouteId });
    return runInTransaction(async (transaction) => {
      const customer = await lockCustomerRow(parsedInput.customerId, "update", transaction);
      if (!customer) throw notFound(`Customer ${parsedInput.customerId} not found`);
      const targetRoute = await getRouteById(parsedInput.toRouteId, transaction);
      if (!targetRoute) throw notFound(`Route ${parsedInput.toRouteId} not found`);
      if (targetRoute.deletedAt) {
        throw badRequest(`Route ${targetRoute.name} is deleted. Pick another Route.`);
      }
      if (targetRoute.id === customer.routeId) {
        throw badRequest(`${customer.shopName} is already on Route ${targetRoute.name}`);
      }
      const openPreorderCount = await countOpenPreordersForCustomer(customer.id, transaction);
      if (openPreorderCount > 0) {
        throw conflict(
          `${customer.shopName} has ${openPreorderCount} open Pre-order${openPreorderCount === 1 ? "" : "s"}. Fulfil or cancel ${openPreorderCount === 1 ? "it" : "them"} before moving the Customer.`,
        );
      }
      const moved = await updateCustomer(customer.id, { routeId: targetRoute.id }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "moved_route",
          entityType: "customer",
          entityId: customer.id,
          customerId: customer.id,
          payload: { fromRouteId: customer.routeId, toRouteId: targetRoute.id },
        },
        transaction,
      );
      return moved!;
    });
  }

  // The same phone may be on more than one Customer.
  public async updateCustomer(
    customerId: string,
    changes: UpdateCustomerInput,
    actorProfileId: string,
  ): Promise<SelectCustomer | undefined> {
    const parsedChanges = updateCustomerInputSchema.parse(changes);
    if (parsedChanges.shopPhotoKey) {
      assertShopPhotoKeyInCustomersFolder(parsedChanges.shopPhotoKey);
    }

    const updatePayload: Parameters<typeof updateCustomer>[1] = { ...parsedChanges };
    if (parsedChanges.shopPhotoKey === null) {
      updatePayload.shopPhotoKey = null;
      updatePayload.shopPhotoUrl = null;
    } else if (parsedChanges.shopPhotoKey) {
      updatePayload.shopPhotoUrl = buildPublicUrl(parsedChanges.shopPhotoKey);
    }

    const { before, after } = await this.updateCustomerWithAudit(
      customerId,
      updatePayload,
      actorProfileId,
    );
    if (before?.shopPhotoKey && after && before.shopPhotoKey !== after.shopPhotoKey) {
      await deleteObject(before.shopPhotoKey);
    }
    return after;
  }

  public async deleteCustomerShopPhoto(
    customerId: string,
    actorProfileId: string,
  ): Promise<SelectCustomer | undefined> {
    const { before, after } = await this.updateCustomerWithAudit(
      customerId,
      { shopPhotoKey: null, shopPhotoUrl: null },
      actorProfileId,
    );
    if (before?.shopPhotoKey) {
      await deleteObject(before.shopPhotoKey);
    }
    return after;
  }

  private async updateCustomerWithAudit(
    customerId: string,
    changes: Parameters<typeof updateCustomer>[1],
    actorProfileId: string,
  ): Promise<{ before?: SelectCustomer; after?: SelectCustomer }> {
    return runInTransaction(async (transaction) => {
      const before = await getCustomerById(customerId, transaction);
      if (!before) return {};
      const after = await updateCustomer(customerId, changes, transaction);
      if (after) {
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "updated",
            entityType: "customer",
            entityId: customerId,
            customerId,
            payload: changedFields(before, after, customerAuditedFields),
          },
          transaction,
        );
      }
      return { before, after };
    });
  }

  public async listOpenOrders(customerId: string): Promise<OpenOrderSummary[]> {
    return listOpenOrdersByCustomerId(customerId);
  }

  public async deactivateCustomer(
    customerId: string,
    actorProfileId: string,
  ): Promise<SelectCustomer | undefined> {
    const existingCustomer = await getCustomerById(customerId);
    if (!existingCustomer) return undefined;

    const openOrderCount = await countOpenOrdersByCustomerId(customerId);
    if (openOrderCount > 0) {
      throw conflict(
        `Customer has ${openOrderCount} open order${openOrderCount === 1 ? "" : "s"} that must be closed or cancelled first`,
      );
    }

    return runInTransaction(async (transaction) => {
      const deactivatedCustomer = await softDeleteCustomer(customerId, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deactivated",
          entityType: "customer",
          entityId: customerId,
          customerId,
        },
        transaction,
      );
      return deactivatedCustomer;
    });
  }

  // The same phone may be on more than one Customer, so reactivate never checks it.
  public async reactivateCustomer(
    customerId: string,
    actorProfileId: string,
  ): Promise<SelectCustomer> {
    return runInTransaction(async (transaction) => {
      const reactivatedCustomer = await reactivateCustomer(customerId, transaction);
      if (!reactivatedCustomer) {
        throw notFound(`Customer ${customerId} not found`);
      }
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "activated",
          entityType: "customer",
          entityId: customerId,
          customerId,
        },
        transaction,
      );
      return reactivatedCustomer;
    });
  }
}

export default CustomerService;
