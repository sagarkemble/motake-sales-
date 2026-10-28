"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BoxIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "~/components/ui/button";
import { SkuChip } from "~/components/admin/products/sku-chip";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { getErrorMessage } from "~/lib/get-error-message";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { useVarietyTaxPeriods } from "~/hooks/use-variety-tax-periods";
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
    isDeactivatingProductVariety,
    reactivateProductVarietyAsync,
    isReactivatingProductVariety,
  } = useProducts({ productId });

  const [editingVariety, setEditingVariety] = useState<ProductVariety | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addedVarietyId, setAddedVarietyId] = useState<string | null>(null);
  const [deactivatingVariety, setDeactivatingVariety] = useState<ProductVariety | null>(null);
  const [reactivatingVariety, setReactivatingVariety] = useState<ProductVariety | null>(null);

  const varietyIds = useMemo(
    () => productVarieties.map((variety) => variety.id),
    [productVarieties],
  );
  const {
    currentTaxes,
    isCurrentTaxesLoading,
    isCurrentTaxesError,
    upsertTaxPeriodAsync,
    isUpsertingTaxPeriod,
  } = useVarietyTaxPeriods({ varietyIds });
  function currentTaxOf(varietyId: string) {
    return currentTaxes.find((tax) => tax.varietyId === varietyId)?.period ?? null;
  }

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
      await updateProductVarietyAsync({
        id: editingVariety.id,
        name: values.name,
        unit: values.unit,
      });
      // A GST change starts today; earlier Bills keep the GST they were issued with.
      if (values.tax) await upsertTaxPeriodAsync({ varietyId: editingVariety.id, ...values.tax });
      toast.success(tx("admin.varieties.updateSuccess"));
    } else {
      const { tax, ...variety } = values;
      const response = await createProductVarietyAsync({ productId, ...variety });
      const varietyId = response.data.id;
      setAddedVarietyId(varietyId);
      if (tax) {
        try {
          await upsertTaxPeriodAsync({ varietyId, ...tax });
        } catch (error) {
          // The Variety is saved; its GST can be added with Edit.
          toast.error(
            tx("admin.varieties.gstSaveFailed", {
              reason: getErrorMessage(error, tx("admin.varietyTax.saveFailed")),
            }),
          );
          setIsDialogOpen(false);
          return;
        }
      }
      toast.success(tx("admin.varieties.addSuccess"));
    }
    setIsDialogOpen(false);
  }

  async function handleDeactivate() {
    if (!deactivatingVariety) return;
    try {
      await deactivateProductVarietyAsync({ id: deactivatingVariety.id });
      toast.success(tx("admin.varieties.deactivateSuccess"));
      setDeactivatingVariety(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.varieties.deactivateFailed")));
    }
  }

  async function handleReactivate() {
    if (!reactivatingVariety) return;
    try {
      await reactivateProductVarietyAsync({ id: reactivatingVariety.id });
      toast.success(tx("admin.varieties.reactivateSuccess"));
      setReactivatingVariety(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.varieties.reactivateFailed")));
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
                  "flex flex-wrap items-start gap-3 rounded-xl border bg-background p-3",
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
                  {!isCurrentTaxesLoading && !isCurrentTaxesError && (
                    <div className="mt-1.5">
                      <TodayTaxLine period={currentTaxOf(variety.id)} />
                    </div>
                  )}
                  {variety.id === addedVarietyId && (
                    <p className="mt-1 text-[11px] font-medium text-brand">
                      {tx("admin.varieties.addedWithSku")}
                    </p>
                  )}
                </div>

                <StatusBadge status={isInactive ? "inactive" : "active"} />

                {/* On a phone the actions drop to their own line so the name keeps its width. */}
                <div className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    // A deactivated variety is read-only until it is reactivated.
                    disabled={isInactive}
                    onClick={() => openEditDialog(variety)}
                    aria-label={tx("admin.varieties.editAria")}
                  >
                    <PencilIcon />
                  </Button>
                  {isInactive ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-brand hover:text-brand"
                      onClick={() => setReactivatingVariety(variety)}
                      aria-label={tx("admin.varieties.reactivateAria")}
                      title={tx("admin.varieties.reactivateAria")}
                    >
                      <RotateCcwIcon />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDeactivatingVariety(variety)}
                      aria-label={tx("admin.varieties.deactivateAria")}
                      title={tx("admin.varieties.deactivateAria")}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={Boolean(deactivatingVariety)}
        onOpenChange={(open) => !open && setDeactivatingVariety(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("admin.varieties.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx("admin.varieties.deactivateBody", {
                name: deactivatingVariety
                  ? `${deactivatingVariety.name} · ${deactivatingVariety.unit}`
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivatingProductVariety}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeactivatingProductVariety}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeactivate();
              }}
            >
              {tx("admin.varieties.deactivateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(reactivatingVariety)}
        onOpenChange={(open) => !open && setReactivatingVariety(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("admin.varieties.reactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx("admin.varieties.reactivateBody", {
                name: reactivatingVariety
                  ? `${reactivatingVariety.name} · ${reactivatingVariety.unit}`
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReactivatingProductVariety}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isReactivatingProductVariety}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={(event) => {
                event.preventDefault();
                void handleReactivate();
              }}
            >
              {tx("admin.varieties.reactivateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VarietyFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        productName={productName}
        editing={
          editingVariety ? { ...editingVariety, tax: currentTaxOf(editingVariety.id) } : undefined
        }
        isSubmitting={isCreatingProductVariety || isUpdatingProductVariety || isUpsertingTaxPeriod}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

type CurrentTax = RouterOutputs["products"]["currentTaxForVarieties"]["data"][number]["period"];

/** Today's GST of a Variety under its name and SKU, or a warning when it cannot be sold. */
function TodayTaxLine({ period }: { period: CurrentTax }) {
  const tx = useTranslate();

  if (!period) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        <AlertTriangleIcon className="size-3" />
        {tx("admin.varietyTax.noGstToday")}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {period.exempt
        ? tx("admin.varietyTax.taxLineExempt", { hsn: period.hsn })
        : tx("admin.varietyTax.taxLineRate", {
            hsn: period.hsn,
            rate: `${period.gstRateBps / 100}%`,
          })}
    </span>
  );
}
