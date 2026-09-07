"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useState } from "react";
import { BoxIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { getErrorMessage } from "~/lib/get-error-message";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import {
  VarietyFormDialog,
  type VarietyFormValues,
} from "~/components/admin/products/variety-form-dialog";

type ProductVariety = RouterOutputs["products"]["listVarieties"]["data"][number];

interface VarietyTableProps {
  productId: string;
}

export function VarietyTable({ productId }: VarietyTableProps) {
  const tx = useTranslate();
  const { formatInr } = useFormatMoney();
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
      toast.success(tx("Variety updated"));
    } else {
      await createProductVarietyAsync({ productId, ...values });
      toast.success(tx("Variety added"));
    }
    setIsDialogOpen(false);
  }

  async function handleDeactivate(variety: ProductVariety) {
    try {
      await deactivateProductVarietyAsync({ id: variety.id });
      toast.success(tx("Variety deactivated"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("Could not deactivate variety. Try again.")));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Varieties</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-full"
          onClick={openAddDialog}
        >
          <PlusIcon />
          Add variety
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {isProductVarietiesLoading ? (
          <ListItemSkeleton count={4} />
        ) : productVarieties.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No varieties yet</p>
        ) : (
          productVarieties.map((variety) => (
            <div
              key={variety.id}
              className="flex items-center gap-3 rounded-xl border bg-background p-3"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <BoxIcon className="size-4 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{variety.name}</p>
                <p className="text-xs text-muted-foreground">
                  {variety.sku} &middot; {variety.unit}
                </p>
                <p className="text-xs font-medium text-brand">{formatInr(variety.unitPrice)}</p>
              </div>

              <StatusBadge status={variety.status} />

              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEditDialog(variety)}
                  aria-label={tx("Edit variety")}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={variety.status === "inactive"}
                  onClick={() => handleDeactivate(variety)}
                  aria-label={tx("Deactivate variety")}
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <VarietyFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        defaultValues={
          editingVariety
            ? {
                sku: editingVariety.sku,
                name: editingVariety.name,
                unit: editingVariety.unit,
                unitPrice: editingVariety.unitPrice,
              }
            : undefined
        }
        isSubmitting={isCreatingProductVariety || isUpdatingProductVariety}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
