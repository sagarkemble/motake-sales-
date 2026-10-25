import {
  createCustomer,
  getCustomerById,
  getCustomerStats,
  listActiveCustomersByIds,
  reactivateCustomer,
  searchCustomers,
  softDeleteCustomer,
  updateCustomer,
  type CustomerStats,
} from "@repo/database/queries/customers";
import {
  countOpenOrdersByCustomerId,
  listOpenOrdersByCustomerId,
  type OpenOrderSummary,
} from "@repo/database/queries/orders";
import { runInTransaction } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectCustomer } from "@repo/database/schema";

import { conflict, forbidden, notFound } from "../errors";
import { changedFields, recordAudit } from "../shared/audit";
import {
  buildObjectKey,
  buildPublicUrl,
  createPresignedUploadUrl,
  deleteObject,
} from "../uploads/r2-client";
import {
  createCustomerInputSchema,
  createShopPhotoUploadUrlInputSchema,
  listCustomersInputSchema,
  updateCustomerInputSchema,
  type CreateCustomerInput,
  type CreateShopPhotoUploadUrlInput,
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
] as const;

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

  public async createCustomer(input: CreateCustomerInput): Promise<SelectCustomer> {
    const parsedInput = createCustomerInputSchema.parse(input);
    assertShopPhotoKeyBelongsToCreator(parsedInput.shopPhotoKey, parsedInput.createdBy);

    const { shopPhotoKey, ...customerFields } = parsedInput;
    return createCustomer({
      ...customerFields,
      shopPhotoKey,
      shopPhotoUrl: buildPublicUrl(shopPhotoKey),
    });
  }

  public async getCustomerById(customerId: string): Promise<SelectCustomer | undefined> {
    return getCustomerById(customerId);
  }

  public async getCustomersByIds(customerIds: string[]): Promise<SelectCustomer[]> {
    return listActiveCustomersByIds(customerIds);
  }

  public async getCustomerStats(customerId: string): Promise<CustomerStats> {
    return getCustomerStats(customerId);
  }

  public async searchCustomers(
    input: ListCustomersInput,
  ): Promise<PaginatedResult<SelectCustomer>> {
    const parsedInput = listCustomersInputSchema.parse(input);
    return searchCustomers(parsedInput.searchTerm, parsedInput, {
      includeInactive: parsedInput.includeInactive,
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
