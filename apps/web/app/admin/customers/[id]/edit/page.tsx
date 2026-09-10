"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import {
  CustomerForm,
  type CustomerFormValues,
} from "~/components/admin/customers/customer-form";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";
import { getErrorMessage } from "~/lib/get-error-message";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";

export default function EditCustomerPage() {
  const tx = useTranslate();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const router = useRouter();

  const { customer, isCustomerLoading, updateCustomerAsync, isUpdatingCustomer } = useCustomers({
    customerId,
  });

  async function handleSubmit(values: CustomerFormValues) {
    try {
      await updateCustomerAsync({
        id: customerId,
        shopName: values.shopName,
        contactName: values.contactName || undefined,
        phone: values.phone,
        address: values.address,
        notes: values.notes || undefined,
        shopPhotoKey: values.shopPhotoKey || null,
      });
      toast.success(tx("admin.customers.updateSuccess"));
      router.push(`/admin/customers/${customerId}`);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.updateFailed")));
    }
  }

  if (isCustomerLoading) {
    return <DetailPageSkeleton />;
  }

  if (!customer) {
    return <div className="p-4 text-sm text-muted-foreground">Customer not found</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href={`/admin/customers/${customerId}`} title="Edit customer" />
      <CustomerForm
        customerId={customerId}
        defaultValues={{
          shopName: customer.shopName,
          contactName: customer.contactName ?? "",
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes ?? "",
          shopPhotoKey: customer.shopPhotoKey ?? "",
          shopPhotoUrl: customer.shopPhotoUrl ?? "",
        }}
        isSubmitting={isUpdatingCustomer}
        submitLabel="Save changes"
        requireShopPhoto={false}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
