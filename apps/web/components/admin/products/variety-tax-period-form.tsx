"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { parseISO } from "date-fns";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import { bpsToPercent, percentToBps } from "~/lib/gst-rate";

export interface TaxPeriodValues {
  effectiveFrom: string;
  hsn: string;
  exempt: boolean;
  gstRateBps: number;
}

interface FinancialYearWindow {
  financialYear: string;
  firstDay: string;
  lastDay: string;
}

type TaxPeriodFormValues = {
  effectiveFrom: string;
  hsn: string;
  exempt: boolean;
  ratePercent: string;
};

interface VarietyTaxPeriodFormProps {
  mode: "add" | "edit";
  initial: TaxPeriodValues;
  /** The current financial year: the only starts the server accepts. */
  financialYear: FinancialYearWindow;
  /** Starts that already exist; adding one of them overwrites that period. */
  existingStarts: string[];
  isSubmitting: boolean;
  onSubmit: (values: TaxPeriodValues) => Promise<void>;
  onCancel: () => void;
}

/** Add and Edit. Edit keeps the start date read-only: the start is the period's identity. */
export function VarietyTaxPeriodForm({
  mode,
  initial,
  financialYear,
  existingStarts,
  isSubmitting,
  onSubmit,
  onCancel,
}: VarietyTaxPeriodFormProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const displayDay = (day: string) => formatDate(parseISO(day), "d MMM yyyy");
  const from = displayDay(financialYear.firstDay);
  const to = displayDay(financialYear.lastDay);

  const taxPeriodFormSchema = useMemo(
    () =>
      z
        .object({
          effectiveFrom: z
            .string()
            .min(1, tx("admin.varietyTax.validation.startRequired"))
            .refine(
              (day) => day >= financialYear.firstDay && day <= financialYear.lastDay,
              tx("admin.varietyTax.validation.startOutsideYear", { from, to }),
            ),
          hsn: z.string().regex(/^[0-9]{4,8}$/, tx("admin.varietyTax.validation.hsnDigits")),
          exempt: z.boolean(),
          ratePercent: z.string(),
        })
        .superRefine((values, context) => {
          if (values.exempt) return;
          const gstRateBps = percentToBps(values.ratePercent);
          if (gstRateBps === undefined || gstRateBps <= 0) {
            context.addIssue({
              code: "custom",
              path: ["ratePercent"],
              message: tx("admin.varietyTax.validation.rate"),
            });
          }
        }),
    [tx, financialYear, from, to],
  );

  const form = useForm<TaxPeriodFormValues>({
    resolver: zodResolver(taxPeriodFormSchema),
    defaultValues: {
      effectiveFrom: initial.effectiveFrom,
      hsn: initial.hsn,
      exempt: initial.exempt,
      ratePercent:
        initial.exempt || initial.gstRateBps === 0 ? "" : bpsToPercent(initial.gstRateBps),
    },
  });
  const [effectiveFrom, exempt] = useWatch({
    control: form.control,
    name: ["effectiveFrom", "exempt"],
  });
  const replaces = mode === "add" && existingStarts.includes(effectiveFrom);

  async function handleFormSubmit(values: TaxPeriodFormValues) {
    await onSubmit({
      effectiveFrom: values.effectiveFrom,
      hsn: values.hsn,
      exempt: values.exempt,
      gstRateBps: values.exempt ? 0 : (percentToBps(values.ratePercent) ?? 0),
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="effectiveFrom"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.varietyTax.form.startDate")}</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={financialYear.firstDay}
                    max={financialYear.lastDay}
                    readOnly={mode === "edit"}
                    disabled={mode === "edit"}
                    className="rounded-xl bg-background"
                    {...field}
                  />
                </FormControl>
                <FormDescription className="text-[11px]">
                  {mode === "edit"
                    ? tx("admin.varietyTax.form.startFixed")
                    : tx("admin.varietyTax.form.startWindow", {
                        financialYear: financialYear.financialYear,
                        from,
                        to,
                      })}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hsn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.varietyTax.form.hsn")}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="0401"
                    className="rounded-xl bg-background"
                    {...field}
                    onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                  />
                </FormControl>
                <FormDescription className="text-[11px]">
                  {tx("admin.varietyTax.form.hsnHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exempt"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between gap-2 self-start rounded-xl border bg-background px-3 py-2">
                <FormLabel>{tx("admin.varietyTax.form.exempt")}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      // Exempt forces the rate to 0; switching back asks for a fresh rate.
                      form.setValue("ratePercent", "");
                      form.clearErrors("ratePercent");
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ratePercent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.varietyTax.form.rate")}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="decimal"
                    placeholder="5"
                    disabled={exempt}
                    className="rounded-xl bg-background"
                    {...field}
                    value={exempt ? "0" : field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {replaces && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {tx("admin.varietyTax.form.replaces", { date: displayDay(effectiveFrom) })}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {tx("common.actions.cancel")}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {isSubmitting
              ? tx("common.status.pleaseWait")
              : mode === "edit"
                ? tx("common.actions.save")
                : replaces
                  ? tx("admin.varietyTax.replacePeriod")
                  : tx("admin.varietyTax.addPeriod")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
