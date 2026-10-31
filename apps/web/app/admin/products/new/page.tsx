"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { ProductForm, type ProductFormValues } from "~/components/admin/products/product-form";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";

export default function NewProductPage() {
  const tx = useTranslate();
  const router = useRouter();
  const { createProductAsync, isCreatingProduct } = useProducts();

  async function handleSubmit(values: ProductFormValues) {
    try {
      const response = await createProductAsync(values);
      toast.success(tx("admin.products.createSuccess"));
      router.push(`/admin/products/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.products.createFailed")));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/products" title={tx("admin.products.newAria")} />
      <ProductForm
        isSubmitting={isCreatingProduct}
        submitLabel={tx("admin.products.createCta")}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
