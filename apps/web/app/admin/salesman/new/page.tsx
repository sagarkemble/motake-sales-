"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { SalesmanForm, type SalesmanFormValues } from "~/components/admin/salesman/salesman-form";
import { getErrorMessage } from "~/lib/get-error-message";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";

export default function NewSalesmanPage() {
  const tx = useTranslate();
  const router = useRouter();
  const { createSalesmanAccountAsync, isCreatingSalesmanAccount } = useSalesmen();

  async function handleSubmit(values: SalesmanFormValues) {
    try {
      const response = await createSalesmanAccountAsync(values);
      toast.success(tx("admin.salesmen.createSuccess"));
      router.push(`/admin/salesman/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.salesmen.createFailed")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/salesman" title={tx("admin.salesmen.newAria")} />
      <SalesmanForm
        isSubmitting={isCreatingSalesmanAccount}
        submitLabel={tx("admin.salesmen.createCta")}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
