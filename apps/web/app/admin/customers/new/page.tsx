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
import { useTranslate } from "~/hooks/use-translate";

export default function NewCustomerPage() {
  const tx = useTranslate();
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
      toast.success(tx("admin.customers.createSuccess"));
      router.push(`/admin/customers/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.createFailed")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/customers" title="admin.customers.newAria" />
      <CustomerForm
        isSubmitting={isCreatingCustomer}
        submitLabel="Save customer"
        requireShopPhoto
        onSubmit={handleSubmit}
      />
    </div>
  );
}
