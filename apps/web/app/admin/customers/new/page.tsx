"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import {
  CustomerForm,
  type CustomerFormValues,
} from "~/components/admin/customers/customer-form";
import { getErrorMessage } from "~/lib/get-error-message";
import { useCustomers } from "~/hooks/use-customers";

export default function NewCustomerPage() {
  const router = useRouter();
  const { createCustomerAsync, isCreatingCustomer } = useCustomers();

  async function handleSubmit(values: CustomerFormValues) {
    try {
      const response = await createCustomerAsync({
        shopName: values.shopName,
        contactName: values.contactName || undefined,
        phone: values.phone,
        address: values.address,
        notes: values.notes || undefined,
        shopPhotoKey: values.shopPhotoKey,
      });
      toast.success("Customer created");
      router.push(`/admin/customers/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create customer. Try again."));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/customers" title="New customer" />
      <CustomerForm
        isSubmitting={isCreatingCustomer}
        submitLabel="Save customer"
        requireShopPhoto
        onSubmit={handleSubmit}
      />
    </div>
  );
}
