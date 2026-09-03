import {
  createCustomer,
  findActiveCustomerByPhone,
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
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectCustomer } from "@repo/database/schema";

import { conflict, forbidden, notFound } from "../errors";
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

    const existingCustomerWithPhone = await findActiveCustomerByPhone(parsedInput.phone);
    if (existingCustomerWithPhone) {
      throw conflict(`Customer with phone ${parsedInput.phone} already exists`);
    }

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

  public async updateCustomer(
    customerId: string,
    changes: UpdateCustomerInput,
  ): Promise<SelectCustomer | undefined> {
    const parsedChanges = updateCustomerInputSchema.parse(changes);
    if (parsedChanges.phone) {
      const existingCustomerWithPhone = await findActiveCustomerByPhone(parsedChanges.phone);
      if (existingCustomerWithPhone && existingCustomerWithPhone.id !== customerId) {
        throw conflict(`Customer with phone ${parsedChanges.phone} already exists`);
      }
    }

    const existingCustomer =
      parsedChanges.shopPhotoKey !== undefined ? await getCustomerById(customerId) : undefined;

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

    const updatedCustomer = await updateCustomer(customerId, updatePayload);

    if (
      existingCustomer?.shopPhotoKey &&
      parsedChanges.shopPhotoKey !== undefined &&
      existingCustomer.shopPhotoKey !== parsedChanges.shopPhotoKey
    ) {
      await deleteObject(existingCustomer.shopPhotoKey);
    }

    return updatedCustomer;
  }

  public async deleteCustomerShopPhoto(customerId: string): Promise<SelectCustomer | undefined> {
    const existingCustomer = await getCustomerById(customerId);
    if (!existingCustomer) return undefined;

    const updatedCustomer = await updateCustomer(customerId, {
      shopPhotoKey: null,
      shopPhotoUrl: null,
    });

    if (existingCustomer.shopPhotoKey) {
      await deleteObject(existingCustomer.shopPhotoKey);
    }

    return updatedCustomer;
  }

  public async listOpenOrders(customerId: string): Promise<OpenOrderSummary[]> {
    return listOpenOrdersByCustomerId(customerId);
  }

  public async deactivateCustomer(customerId: string): Promise<SelectCustomer | undefined> {
    const existingCustomer = await getCustomerById(customerId);
    if (!existingCustomer) return undefined;

    const openOrderCount = await countOpenOrdersByCustomerId(customerId);
    if (openOrderCount > 0) {
      throw conflict(
        `Customer has ${openOrderCount} open order${openOrderCount === 1 ? "" : "s"} that must be closed or cancelled first`,
      );
    }

    return softDeleteCustomer(customerId);
  }

  public async reactivateCustomer(customerId: string): Promise<SelectCustomer> {
    const existingCustomer = await getCustomerById(customerId);
    if (!existingCustomer) {
      throw notFound(`Customer ${customerId} not found`);
    }

    const existingCustomerWithPhone = await findActiveCustomerByPhone(existingCustomer.phone);
    if (existingCustomerWithPhone && existingCustomerWithPhone.id !== customerId) {
      throw conflict(`Customer with phone ${existingCustomer.phone} already exists`);
    }

    const reactivatedCustomer = await reactivateCustomer(customerId);
    if (!reactivatedCustomer) {
      throw notFound(`Customer ${customerId} not found`);
    }
    return reactivatedCustomer;
  }
}

export default CustomerService;
