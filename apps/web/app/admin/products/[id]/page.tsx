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
import { useTranslate } from "~/hooks/use-translate";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";

export default function EditProductPage() {
  const tx = useTranslate();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const {
    product,
    isProductLoading,
    updateProductAsync,
    isUpdatingProduct,
    deactivateProductAsync,
    isDeactivatingProduct,
    reactivateProductAsync,
    isReactivatingProduct,
    deleteProductAsync,
    isDeletingProduct,
  } = useProducts({ productId });

  async function handleSubmit(values: ProductFormValues) {
    try {
      await updateProductAsync({ id: productId, ...values });
      toast.success(tx("Product updated"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not update product. Try again.")));
    }
  }

  async function handleDeactivate() {
    try {
      await deactivateProductAsync({ id: productId });
      toast.success(tx("Product deactivated"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not deactivate product. Try again.")));
    }
  }

  async function handleReactivate() {
    try {
      await reactivateProductAsync({ id: productId });
      toast.success(tx("Product reactivated"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not reactivate product. Try again.")));
    }
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to soft-delete this product?")) return;
    try {
      await deleteProductAsync({ id: productId });
      toast.success(tx("Product deleted"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not delete product. Try again.")));
    }
  }

  if (isProductLoading) {
    return <DetailPageSkeleton />;
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
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} />
          {product.deletedAt && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              Deleted
            </span>
          )}
          {product.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={isDeactivatingProduct || Boolean(product.deletedAt)}
              onClick={handleDeactivate}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-brand text-brand hover:bg-brand/10"
              disabled={isReactivatingProduct || Boolean(product.deletedAt)}
              onClick={handleReactivate}
            >
              Reactivate
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
            disabled={isDeletingProduct || Boolean(product.deletedAt)}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </div>

      <ProductForm
        productId={productId}
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
