"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useState } from "react";
import { BoxIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { SkuChip } from "~/components/admin/products/sku-chip";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import {
  VarietyFormDialog,
  type VarietyFormValues,
} from "~/components/admin/products/variety-form-dialog";

type ProductVariety = RouterOutputs["products"]["listVarieties"]["data"][number];

interface VarietyTableProps {
  productId: string;
  productName: string;
}

export function VarietyTable({ productId, productName }: VarietyTableProps) {
  const tx = useTranslate();
  const {
    productVarieties,
    isProductVarietiesLoading,
    createProductVarietyAsync,
    isCreatingProductVariety,
    updateProductVarietyAsync,
    isUpdatingProductVariety,
    deactivateProductVarietyAsync,
  } = useProducts({ productId });

  const [editingVariety, setEditingVariety] = useState<ProductVariety | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addedVarietyId, setAddedVarietyId] = useState<string | null>(null);

  function openAddDialog() {
    setEditingVariety(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(variety: ProductVariety) {
    setEditingVariety(variety);
    setIsDialogOpen(true);
  }

  async function handleSubmit(values: VarietyFormValues) {
    if (editingVariety) {
      await updateProductVarietyAsync({ id: editingVariety.id, ...values });
      toast.success(tx("admin.varieties.updateSuccess"));
    } else {
      const response = await createProductVarietyAsync({ productId, ...values });
      setAddedVarietyId(response.data.id);
      toast.success(tx("admin.varieties.addSuccess"));
    }
    setIsDialogOpen(false);
  }

  async function handleDeactivate(variety: ProductVariety) {
    try {
      await deactivateProductVarietyAsync({ id: variety.id });
      toast.success(tx("admin.varieties.deactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.varieties.deactivateFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{tx("admin.varieties.title")}</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={openAddDialog}
        >
          <PlusIcon />
          {tx("admin.varieties.addTitle")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {isProductVarietiesLoading ? (
          <ListItemSkeleton count={4} />
        ) : productVarieties.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tx("admin.varieties.empty")}
          </p>
        ) : (
          productVarieties.map((variety) => {
            const isInactive = variety.status === "inactive";
            return (
              <div
                key={variety.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-background p-3",
                  isInactive && "border-dashed bg-muted/30",
                  variety.id === addedVarietyId && "border-brand ring-2 ring-brand/20",
                )}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <BoxIcon className="size-4 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      isInactive && "text-muted-foreground",
                    )}
                  >
                    {variety.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      &middot; {variety.unit}
                    </span>
                  </p>
                  <SkuChip sku={variety.sku} muted={isInactive} className="mt-1" />
                  {variety.id === addedVarietyId && (
                    <p className="mt-1 text-[11px] font-medium text-brand">
                      {tx("admin.varieties.addedWithSku")}
                    </p>
                  )}
                </div>

                <StatusBadge status={variety.status} />

                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => openEditDialog(variety)}
                    aria-label={tx("admin.varieties.editAria")}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isInactive}
                    onClick={() => handleDeactivate(variety)}
                    aria-label={tx("admin.varieties.deactivateAria")}
                  >
                    <XIcon />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <VarietyFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        productName={productName}
        editing={editingVariety ?? undefined}
        isSubmitting={isCreatingProductVariety || isUpdatingProductVariety}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
