"use client";

import { PackageIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { ProductForm, type ProductFormValues } from "~/components/admin/products/product-form";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { VarietyTable } from "~/components/admin/products/variety-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";

export default function EditProductPage() {
  const tx = useTranslate();
  const router = useRouter();
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
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  async function handleSubmit(values: ProductFormValues) {
    try {
      await updateProductAsync({ id: productId, ...values });
      toast.success(tx("admin.products.updateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.products.updateFailed")));
    }
  }

  async function handleDeactivate() {
    try {
      await deactivateProductAsync({ id: productId });
      toast.success(tx("admin.products.deactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.products.deactivateFailed")));
    } finally {
      setIsDeactivateConfirmOpen(false);
    }
  }

  async function handleReactivate() {
    try {
      await reactivateProductAsync({ id: productId });
      toast.success(tx("admin.products.reactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.products.reactivateFailed")));
    }
  }

  async function handleDelete() {
    try {
      await deleteProductAsync({ id: productId });
      toast.success(tx("admin.products.deleteSuccess"));
      router.push("/admin/products");
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.products.deleteFailed")));
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  }

  if (isProductLoading) {
    return <DetailPageSkeleton />;
  }

  if (!product) {
    return <div className="p-4 text-sm text-muted-foreground">{tx("admin.products.notFound")}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-4 sm:px-6">
      <BackHeader href="/admin/products" title={tx("admin.products.editTitle")} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card shadow-sm p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted-soft">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" className="size-full object-contain p-1" />
            ) : (
              <PackageIcon className="size-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">{tx("admin.products.statusLabel")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={product.status} />
          {product.deletedAt && (
            <Badge
              variant="outline"
              className="border-transparent bg-destructive/10 text-destructive"
            >
              {tx("common.status.deleted")}
            </Badge>
          )}
          {product.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-destructive text-destructive hover:bg-destructive-soft hover:text-destructive"
              disabled={isDeactivatingProduct || Boolean(product.deletedAt)}
              onClick={() => setIsDeactivateConfirmOpen(true)}
            >
              {tx("admin.products.deactivateConfirm")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-brand text-brand hover:bg-brand-soft"
              disabled={isReactivatingProduct || Boolean(product.deletedAt)}
              onClick={handleReactivate}
            >
              {tx("admin.products.reactivate")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full border-destructive text-destructive hover:bg-destructive-soft"
            disabled={isDeletingProduct || Boolean(product.deletedAt)}
            onClick={() => setIsDeleteConfirmOpen(true)}
          >
            {tx("admin.products.deleteConfirm")}
          </Button>
        </div>
      </div>

      {/* Varieties open first: right after creating a Product, adding its Varieties is the next step. */}
      <Tabs defaultValue="varieties" className="gap-4">
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-full sm:w-96">
          <TabsTrigger value="varieties" className="rounded-full">
            {tx("admin.products.tabs.varieties")}
          </TabsTrigger>
          <TabsTrigger value="details" className="rounded-full">
            {tx("admin.products.tabs.details")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="varieties">
          <VarietyTable productId={productId} productName={product.name} />
        </TabsContent>
        {/* Kept mounted so unsaved edits survive a look at the Varieties tab. */}
        <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
          <ProductForm
            productId={productId}
            defaultValues={{
              name: product.name,
              description: product.description ?? "",
              imageKey: product.imageKey ?? "",
              imageUrl: product.imageUrl ?? "",
            }}
            isSubmitting={isUpdatingProduct}
            submitLabel={tx("admin.products.saveChanges")}
            onSubmit={handleSubmit}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog open={isDeactivateConfirmOpen} onOpenChange={setIsDeactivateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("admin.products.deactivateTitle", { name: product.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{tx("admin.products.deactivateBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivatingProduct}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeactivatingProduct}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeactivate();
              }}
            >
              {tx("admin.products.deactivateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("admin.products.deleteTitle", { name: product.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{tx("admin.products.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingProduct}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingProduct}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {tx("admin.products.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
