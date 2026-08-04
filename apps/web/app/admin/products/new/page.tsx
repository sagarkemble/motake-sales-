"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { ProductForm, type ProductFormValues } from "~/components/admin/products/product-form";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";

export default function NewProductPage() {
  const router = useRouter();
  const { createProductAsync, isCreatingProduct } = useProducts();

  async function handleSubmit(values: ProductFormValues) {
    try {
      const response = await createProductAsync(values);
      toast.success("Product created");
      router.push(`/admin/products/${response.data.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not create product. Try again."));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/products" title="New product" />
      <ProductForm isSubmitting={isCreatingProduct} submitLabel="Create product" onSubmit={handleSubmit} />
    </div>
  );
}
