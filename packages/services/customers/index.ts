import {
  createCustomer,
  findActiveCustomerByPhone,
  getCustomerById,
  getCustomerStats,
  listActiveCustomersByIds,
  searchActiveCustomers,
  softDeleteCustomer,
  updateCustomer,
  type CustomerStats,
} from "@repo/database/queries/customers";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectCustomer } from "@repo/database/schema";

import { conflict } from "../errors";
import {
  createCustomerInputSchema,
  listCustomersInputSchema,
  updateCustomerInputSchema,
  type CreateCustomerInput,
  type ListCustomersInput,
  type UpdateCustomerInput,
} from "./model";

class CustomerService {
  public async createCustomer(input: CreateCustomerInput): Promise<SelectCustomer> {
    const parsedInput = createCustomerInputSchema.parse(input);
    const existingCustomerWithPhone = await findActiveCustomerByPhone(parsedInput.phone);
    if (existingCustomerWithPhone) {
      throw conflict(`Customer with phone ${parsedInput.phone} already exists`);
    }
    return createCustomer(parsedInput);
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

  public async searchCustomers(input: ListCustomersInput): Promise<PaginatedResult<SelectCustomer>> {
    const parsedInput = listCustomersInputSchema.parse(input);
    return searchActiveCustomers(parsedInput.searchTerm, parsedInput);
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
    return updateCustomer(customerId, parsedChanges);
  }

  public async deactivateCustomer(customerId: string): Promise<SelectCustomer | undefined> {
    return softDeleteCustomer(customerId);
  }
}

export default CustomerService;
