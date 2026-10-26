"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { parseISO } from "date-fns";
import { LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  VarietyTaxPeriodForm,
  type TaxPeriodValues,
} from "~/components/admin/products/variety-tax-period-form";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
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
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { useFormatDate } from "~/hooks/use-format-date";
import { useIsMobile } from "~/hooks/use-mobile";
import { useTranslate } from "~/hooks/use-translate";
import { useVarietyTaxPeriods } from "~/hooks/use-variety-tax-periods";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";

type ProductVariety = RouterOutputs["products"]["listVarieties"]["data"][number];
type TaxPeriod = RouterOutputs["products"]["listTaxPeriods"]["data"]["periods"][number];

interface VarietyTaxPanelProps {
  /** The Variety whose GST periods are shown; null closes the panel. */
  variety: ProductVariety | null;
  onOpenChange: (open: boolean) => void;
}

/** Every GST period of one Variety, newest start first, with Add, Edit and Delete. */
export function VarietyTaxPanel({ variety, onOpenChange }: VarietyTaxPanelProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const isMobile = useIsMobile();
  const displayDay = (day: string) => formatDate(parseISO(day), "d MMM yyyy");
  const [form, setForm] = useState<{ mode: "add" | "edit"; period?: TaxPeriod } | null>(null);
  const [deletingPeriod, setDeletingPeriod] = useState<TaxPeriod | null>(null);

  const {
    taxPeriodList,
    isTaxPeriodListLoading,
    isTaxPeriodListError,
    upsertTaxPeriodAsync,
    isUpsertingTaxPeriod,
    deleteTaxPeriodAsync,
    isDeletingTaxPeriod,
  } = useVarietyTaxPeriods({ varietyId: variety?.id });

  const periods = taxPeriodList?.periods ?? [];
  const firstDayOfYear = taxPeriodList?.currentFinancialYear.firstDay;
  // A deactivated Variety's periods are read-only; the server refuses writes for it.
  const isReadOnly = variety?.status === "inactive";

  function handleOpenChange(open: boolean) {
    if (!open) setForm(null);
    onOpenChange(open);
  }

  async function handleSubmit(values: TaxPeriodValues) {
    if (!variety) return;
    try {
      const response = await upsertTaxPeriodAsync({ varietyId: variety.id, ...values });
      toast.success(
        tx(
          response.data.outcome === "created"
            ? "admin.varietyTax.addSuccess"
            : "admin.varietyTax.updateSuccess",
          { date: displayDay(values.effectiveFrom) },
        ),
      );
      setForm(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.varietyTax.saveFailed")));
    }
  }

  async function handleDelete() {
    if (!deletingPeriod) return;
    try {
      const response = await deleteTaxPeriodAsync({ id: deletingPeriod.id });
      const covering = response.data.coveringToday;
      toast.success(
        covering
          ? tx("admin.varietyTax.deleteSuccessCovered", {
              date: displayDay(covering.effectiveFrom),
            })
          : tx("admin.varietyTax.deleteSuccessUncovered"),
      );
      setDeletingPeriod(null);
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.varietyTax.deleteFailed")));
    }
  }

  // What covers today once this period is gone: the latest other start on or before today.
  function deleteConfirmText(period: TaxPeriod): string {
    const today = taxPeriodList?.today ?? "";
    const coveringAfter = periods.find(
      (item) => item.id !== period.id && item.effectiveFrom <= today,
    );
    const date = displayDay(period.effectiveFrom);
    return coveringAfter
      ? tx("admin.varietyTax.deleteBodyCovered", {
          date,
          coveringDate: displayDay(coveringAfter.effectiveFrom),
        })
      : tx("admin.varietyTax.deleteBodyUncovered", {
          date,
          name: variety ? `${variety.name} · ${variety.unit}` : "",
        });
  }

  return (
    <>
      <Sheet open={Boolean(variety)} onOpenChange={handleOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("gap-0", isMobile ? "max-h-[90dvh] rounded-t-2xl" : "w-full sm:max-w-md")}
        >
          <SheetHeader className="pr-10">
            <SheetTitle>{variety ? `${variety.name} · ${variety.unit}` : ""}</SheetTitle>
            <SheetDescription className="font-mono text-xs">{variety?.sku}</SheetDescription>
          </SheetHeader>

          {/* Radix lays the viewport content out as a table; block keeps the content at the sheet width. */}
          <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            <div className="flex flex-col gap-3 px-4 pb-6">
              {isReadOnly && (
                <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                  {tx("admin.varietyTax.inactiveReadOnly")}
                </p>
              )}

              {taxPeriodList && !isReadOnly && form && (
                <VarietyTaxPeriodForm
                  key={form.period?.id ?? "new"}
                  mode={form.mode}
                  initial={
                    form.period ?? {
                      effectiveFrom: taxPeriodList.today,
                      hsn: "",
                      exempt: false,
                      gstRateBps: 0,
                    }
                  }
                  financialYear={taxPeriodList.currentFinancialYear}
                  existingStarts={periods.map((period) => period.effectiveFrom)}
                  isSubmitting={isUpsertingTaxPeriod}
                  onSubmit={handleSubmit}
                  onCancel={() => setForm(null)}
                />
              )}
              {taxPeriodList && !isReadOnly && !form && (
                <Button
                  type="button"
                  size="sm"
                  className="self-start rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={() => setForm({ mode: "add" })}
                >
                  <PlusIcon />
                  {tx("admin.varietyTax.addPeriod")}
                </Button>
              )}

              {isTaxPeriodListLoading ? (
                <ListItemSkeleton count={3} />
              ) : isTaxPeriodListError ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {tx("admin.varietyTax.loadFailed")}
                </p>
              ) : periods.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {tx("admin.varietyTax.empty")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {periods.map((period) => (
                    <TaxPeriodCard
                      key={period.id}
                      period={period}
                      isPastYear={
                        firstDayOfYear !== undefined && period.effectiveFrom < firstDayOfYear
                      }
                      displayDay={displayDay}
                      onEdit={() => setForm({ mode: "edit", period })}
                      onDelete={() => setDeletingPeriod(period)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={Boolean(deletingPeriod)}
        onOpenChange={(open) => !open && setDeletingPeriod(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("admin.varietyTax.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPeriod ? deleteConfirmText(deletingPeriod) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTaxPeriod}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingTaxPeriod}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {tx("admin.varietyTax.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface TaxPeriodCardProps {
  period: TaxPeriod;
  isPastYear: boolean;
  displayDay: (day: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}

function TaxPeriodCard({ period, isPastYear, displayDay, onEdit, onDelete }: TaxPeriodCardProps) {
  const tx = useTranslate();
  const chip = period.coversToday
    ? { text: tx("admin.varietyTax.coversToday"), className: "bg-brand/10 text-brand" }
    : period.upcoming
      ? {
          text: tx("admin.varietyTax.upcoming"),
          className: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        }
      : isPastYear
        ? { text: tx("admin.varietyTax.pastYear"), className: "bg-muted text-muted-foreground" }
        : null;

  return (
    <li className="rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {tx("admin.varietyTax.from", { date: displayDay(period.effectiveFrom) })}
          </p>
          <p className="text-xs text-muted-foreground">
            {tx("admin.varietyTax.hsn", { hsn: period.hsn })} &middot;{" "}
            {period.exempt
              ? tx("admin.varietyTax.exempt")
              : tx("admin.varietyTax.taxable", { rate: `${period.gstRateBps / 100}%` })}
          </p>
        </div>
        {chip && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              chip.className,
            )}
          >
            {chip.text}
          </span>
        )}
      </div>

      {period.editable ? (
        <div className="mt-2 flex items-center justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onEdit}>
            <PencilIcon className="size-3" />
            {tx("admin.varietyTax.edit")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon className="size-3" />
            {tx("admin.varietyTax.delete")}
          </Button>
        </div>
      ) : (
        isPastYear && (
          <p className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <LockIcon className="size-3" />
            {tx("admin.varietyTax.pastYearFixed")}
          </p>
        )
      )}
    </li>
  );
}
