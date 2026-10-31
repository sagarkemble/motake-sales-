"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { businessDateOf, TRPCClientError } from "@repo/trpc/client";
import { parseISO } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AddUnitDialog } from "~/components/admin/products/add-unit-dialog";
import { LockedSku } from "~/components/admin/products/sku-chip";
import {
  DEFAULT_GST_RATE_PERCENT,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useUnits } from "~/hooks/use-units";

const ADD_UNIT = "__add_unit__";
const SIZE_PATTERN = /^\d{1,7}(\.\d{1,3})?$/;

const emptyValues = {
  name: "",
  sizeValue: "",
  uomCode: "ml",
  hsn: "",
  exempt: false,
  ratePercent: DEFAULT_GST_RATE_PERCENT,
};

export type VarietyFormValues = {
  name: string;
  sizeValue: string;
  uomCode: string;
  /** GST starting today; null when it is left empty or unchanged. */
  tax: (VarietyTax & { effectiveFrom: string }) | null;
};

type VarietyDialogFormValues = {
  name: string;
  sizeValue: string;
  uomCode: string;
} & TaxRateFieldValues;

// "Toned Milk 500 ml", as the server prints it: no trailing zeros, just the size with no name.
function displayNameOf(values: { name: string; sizeValue: string; uomCode: string }) {
  const size = SIZE_PATTERN.test(values.sizeValue.trim()) ? Number(values.sizeValue) : null;
  return size === null ? null : `${values.name.trim()} ${size} ${values.uomCode}`.trim();
}

// No HSN, not exempt and the rate cleared means "no GST yet"; only a Variety without GST can leave
// it so. A GST rate, the default included, asks for an HSN.
function isTaxLeftEmpty(values: TaxRateFieldValues) {
  return values.hsn === "" && !values.exempt && values.ratePercent.trim() === "";
}

function toTaxFieldValues(tax: VarietyTax | null): TaxRateFieldValues {
  if (!tax) return { hsn: "", exempt: false, ratePercent: DEFAULT_GST_RATE_PERCENT };
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
  editing?: {
    name: string;
    sizeValue: string | null;
    uomCode: string | null;
    sku: string;
    tax: VarietyTax | null;
  };
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
          name: z.string().trim().max(120),
          sizeValue: z
            .string()
            .trim()
            .min(1, tx("admin.varieties.validation.sizeRequired"))
            .regex(SIZE_PATTERN, tx("admin.varieties.validation.sizeNumber"))
            .refine((sizeValue) => Number(sizeValue) > 0, {
              message: tx("admin.varieties.validation.sizePositive"),
            }),
          uomCode: z.string().min(1),
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
              message:
                values.hsn === ""
                  ? tx("admin.varietyTax.validation.hsnRequired")
                  : tx("admin.varietyTax.validation.hsnDigits"),
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
  const { units } = useUnits({ enabled: open });
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [name, sizeValue, uomCode] = form.watch(["name", "sizeValue", "uomCode"]);
  const shownName = displayNameOf({ name, sizeValue, uomCode });

  useEffect(() => {
    if (open) {
      form.reset(
        editing
          ? {
              name: editing.name,
              // Stored as 500.000; shown as typed.
              sizeValue: editing.sizeValue === null ? "" : String(Number(editing.sizeValue)),
              uomCode: editing.uomCode ?? emptyValues.uomCode,
              ...toTaxFieldValues(editing.tax),
            }
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
      await onSubmit({
        name: values.name.trim(),
        sizeValue: values.sizeValue.trim(),
        uomCode: values.uomCode,
        tax,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(tx, error, tx("admin.varieties.saveFailed"));
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
                  <p className="rounded-xl border bg-muted-faint px-3 py-2 text-sm">
                    {productName}
                  </p>
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
                          className="rounded-xl bg-muted-soft"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {tx("admin.varieties.nameHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name="sizeValue"
                      render={({ field }) => (
                        <FormItem className="min-w-0 flex-1">
                          <FormLabel>{tx("admin.varieties.size")}</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="decimal"
                              placeholder={tx("admin.varieties.sizePlaceholder")}
                              className="rounded-xl bg-muted-soft"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="uomCode"
                      render={({ field }) => (
                        <FormItem className="w-28 shrink-0">
                          <FormLabel>{tx("admin.varieties.unit")}</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              if (value === ADD_UNIT) setIsAddUnitOpen(true);
                              // Radix sends "" while the value has no item yet; keep the unit.
                              else if (value) field.onChange(value);
                            }}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full rounded-xl bg-muted-soft">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.code}>
                                  {unit.code}
                                </SelectItem>
                              ))}
                              <SelectSeparator />
                              <SelectItem value={ADD_UNIT} className="text-brand">
                                <PlusIcon className="size-4" />
                                {tx("admin.varieties.addUnit")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {shownName && (
                    <p className="rounded-xl bg-muted-soft px-3 py-2 text-xs text-muted-foreground">
                      {tx("admin.varieties.showsAs", { name: shownName })}
                    </p>
                  )}
                </div>

                {editing && <LockedSku sku={editing.sku} />}

                <div className="flex flex-col gap-3 rounded-xl border bg-muted-faint p-3">
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
      <AddUnitDialog
        open={isAddUnitOpen}
        onOpenChange={setIsAddUnitOpen}
        onAdded={(unit) => form.setValue("uomCode", unit.code, { shouldDirty: true })}
      />
    </Dialog>
  );
}
