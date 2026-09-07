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
      toast.success(tx("Salesman created"));
      router.push(`/admin/salesman/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not create salesman. Try again.")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/salesman" title="New salesman" />
      <SalesmanForm
        isSubmitting={isCreatingSalesmanAccount}
        submitLabel="Create salesman"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
