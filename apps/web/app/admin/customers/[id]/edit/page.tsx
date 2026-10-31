"use client";

import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import {
  CustomerForm,
  normalizeGstin,
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
        cityId: values.cityId,
        shopPhotoKey: values.shopPhotoKey || null,
        gstin: normalizeGstin(values.gstin) || null,
      });
      toast.success(tx("admin.customers.updateSuccess"));
      router.push(`/admin/customers/${customerId}`);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.customers.updateFailed")));
    }
  }

  if (isCustomerLoading) {
    return <DetailPageSkeleton />;
  }

  if (!customer) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{tx("admin.customers.notFound")}</div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6">
      <BackHeader href={`/admin/customers/${customerId}`} title={tx("admin.customers.editTitle")} />
      <CustomerForm
        mode="edit"
        customerId={customerId}
        defaultValues={{
          shopName: customer.shopName,
          contactName: customer.contactName ?? "",
          phone: customer.phone,
          address: customer.address,
          notes: customer.notes ?? "",
          cityId: customer.cityId ?? "",
          shopPhotoKey: customer.shopPhotoKey ?? "",
          shopPhotoUrl: customer.shopPhotoUrl ?? "",
          gstin: customer.gstin ?? "",
        }}
        fixedDetails={{
          routeName: customer.routeName,
          routeCode: customer.routeCode,
          routeHidden: customer.routeHidden,
          preferredLanguage: customer.preferredLanguage,
        }}
        isSubmitting={isUpdatingCustomer}
        submitLabel={tx("admin.customers.form.saveChanges")}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
