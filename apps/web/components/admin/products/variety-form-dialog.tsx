"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { businessDateOf, TRPCClientError } from "@repo/trpc/client";
import { parseISO } from "date-fns";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { LockedSku } from "~/components/admin/products/sku-chip";
import {
  HSN_PATTERN,
  VarietyTaxRateFields,
  type TaxRateFieldValues,
  type VarietyTax,
} from "~/components/admin/products/variety-tax-rate-fields";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { getErrorMessage } from "~/lib/get-error-message";
import { bpsToPercent, percentToBps } from "~/lib/gst-rate";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

const UNIT_SUGGESTIONS = ["pouch", "pack", "cup", "tin", "box", "kg"];

const emptyValues = { name: "", unit: "", hsn: "", exempt: false, ratePercent: "" };

export type VarietyFormValues = {
  name: string;
  unit: string;
  /** GST starting today; null when it is left empty or unchanged. */
  tax: (VarietyTax & { effectiveFrom: string }) | null;
};

type VarietyDialogFormValues = { name: string; unit: string } & TaxRateFieldValues;

// All three left empty means "no GST yet"; only a Variety without GST can leave them empty.
function isTaxLeftEmpty(values: TaxRateFieldValues) {
  return values.hsn === "" && !values.exempt && values.ratePercent.trim() === "";
}

function toTaxFieldValues(tax: VarietyTax | null): TaxRateFieldValues {
  if (!tax) return { hsn: "", exempt: false, ratePercent: "" };
  return {
    hsn: tax.hsn,
    exempt: tax.exempt,
    ratePercent: tax.exempt || tax.gstRateBps === 0 ? "" : bpsToPercent(tax.gstRateBps),
  };
}

function toTax(values: TaxRateFieldValues): VarietyTax {
  return {
    hsn: values.hsn,
    exempt: values.exempt,
    gstRateBps: values.exempt ? 0 : (percentToBps(values.ratePercent) ?? 0),
  };
}

function isSameTax(left: VarietyTax, right: VarietyTax) {
  return (
    left.hsn === right.hsn && left.exempt === right.exempt && left.gstRateBps === right.gstRateBps
  );
}

interface VarietyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  /** The Variety being edited with its GST for today; omitted when adding one. */
  editing?: { name: string; unit: string; sku: string; tax: VarietyTax | null };
  isSubmitting: boolean;
  onSubmit: (values: VarietyFormValues) => Promise<void>;
}

export function VarietyFormDialog({
  open,
  onOpenChange,
  productName,
  editing,
  isSubmitting,
  onSubmit,
}: VarietyFormDialogProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const varietyFormSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, tx("admin.varieties.validation.nameRequired")).max(120),
          unit: z.string().trim().min(1, tx("admin.varieties.validation.unitRequired")).max(32),
          hsn: z.string(),
          exempt: z.boolean(),
          ratePercent: z.string(),
        })
        .superRefine((values, context) => {
          // GST can be left for later, but not taken away once a Variety has it.
          if (isTaxLeftEmpty(values) && !editing?.tax) return;
          if (!HSN_PATTERN.test(values.hsn)) {
            context.addIssue({
              code: "custom",
              path: ["hsn"],
              message: tx("admin.varietyTax.validation.hsnDigits"),
            });
          }
          const gstRateBps = percentToBps(values.ratePercent);
          if (!values.exempt && (gstRateBps === undefined || gstRateBps <= 0)) {
            context.addIssue({
              code: "custom",
              path: ["ratePercent"],
              message: tx("admin.varietyTax.validation.rate"),
            });
          }
        }),
    [tx, editing?.tax],
  );
  const form = useForm<VarietyDialogFormValues>({
    resolver: zodResolver(varietyFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        editing
          ? { name: editing.name, unit: editing.unit, ...toTaxFieldValues(editing.tax) }
          : emptyValues,
      );
    }
  }, [open, editing, form]);

  const today = businessDateOf(new Date());

  async function handleFormSubmit(values: VarietyDialogFormValues) {
    const enteredTax = isTaxLeftEmpty(values) ? null : toTax(values);
    const isTaxChanged =
      enteredTax !== null && !(editing?.tax && isSameTax(editing.tax, enteredTax));
    const tax = enteredTax && isTaxChanged ? { effectiveFrom: today, ...enteredTax } : null;
    try {
      await onSubmit({ name: values.name, unit: values.unit, tax });
    } catch (error) {
      const errorMessage = getErrorMessage(error, tx("admin.varieties.saveFailed"));
      // The server refuses a second Variety with the same name under this Product.
      if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
        form.setError("name", { message: errorMessage });
      } else {
        toast.error(errorMessage);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {tx(editing ? "admin.varieties.editTitle" : "admin.varieties.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleFormSubmit)}
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            {/* Radix lays the viewport content out as a table; block keeps the fields at the dialog width. */}
            <ScrollArea className="-mx-1 flex min-h-0 flex-1 flex-col pr-3 [&>[data-slot=scroll-area-viewport]>div]:block!">
              <div className="flex flex-col gap-4 px-1 pb-1">
                <div className="flex flex-col gap-2">
                  <Label>{tx("admin.varieties.product")}</Label>
                  <p className="rounded-xl border bg-muted/20 px-3 py-2 text-sm">{productName}</p>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tx("common.fields.name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={tx("admin.varieties.namePlaceholder")}
                          className="rounded-xl bg-muted/40"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{tx("admin.varieties.unit")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={tx("admin.varieties.unitPlaceholder")}
                          className="rounded-xl bg-muted/40"
                          {...field}
                        />
                      </FormControl>
                      <div className="flex flex-wrap gap-1.5">
                        {UNIT_SUGGESTIONS.map((unit) => (
                          <Button
                            key={unit}
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              "h-7 rounded-full px-3 text-xs",
                              field.value === unit &&
                                "border-brand bg-brand/10 text-brand hover:bg-brand/10 hover:text-brand",
                            )}
                            onClick={() => field.onChange(unit)}
                          >
                            {unit}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {editing ? (
                  <LockedSku sku={editing.sku} />
                ) : (
                  <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                    {tx("admin.varieties.skuOnSave")}
                  </p>
                )}

                <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {tx(
                        editing?.tax
                          ? "admin.varieties.gstTitle"
                          : "admin.varieties.gstTitleOptional",
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tx(
                        editing?.tax ? "admin.varieties.gstEditHint" : "admin.varieties.gstHint",
                        {
                          date: formatDate(parseISO(today), "d MMM yyyy"),
                        },
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <VarietyTaxRateFields />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {isSubmitting
                  ? tx("common.status.pleaseWait")
                  : tx(editing ? "common.actions.save" : "admin.varieties.addTitle")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
