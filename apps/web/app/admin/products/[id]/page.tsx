"use client";

import { useParams } from "next/navigation";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { ProductForm, type ProductFormValues } from "~/components/admin/products/product-form";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { VarietyTable } from "~/components/admin/products/variety-table";
import { Button } from "~/components/ui/button";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const {
    product,
    isProductLoading,
    updateProductAsync,
    isUpdatingProduct,
    deactivateProductAsync,
    isDeactivatingProduct,
  } = useProducts({ productId });

  async function handleSubmit(values: ProductFormValues) {
    try {
      await updateProductAsync({ id: productId, ...values });
      toast.success("Product updated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update product. Try again."));
    }
  }

  async function handleDeactivate() {
    try {
      await deactivateProductAsync({ id: productId });
      toast.success("Product deactivated");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not deactivate product. Try again."));
    }
  }

  if (isProductLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading</div>;
  }

  if (!product) {
    return <div className="p-4 text-sm text-muted-foreground">Product not found</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <BackHeader href="/admin/products" title="Edit product" />

      <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground">Product status</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={product.status} />
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={product.status === "inactive" || isDeactivatingProduct}
            onClick={handleDeactivate}
          >
            Deactivate
          </Button>
        </div>
      </div>

      <ProductForm
        defaultValues={{
          name: product.name,
          description: product.description ?? "",
          imageKey: product.imageKey ?? "",
          imageUrl: product.imageUrl ?? "",
        }}
        isSubmitting={isUpdatingProduct}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
      />

      <VarietyTable productId={productId} />
    </div>
  );
}
