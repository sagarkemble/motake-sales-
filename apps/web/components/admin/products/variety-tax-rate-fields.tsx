"use client";

import { useFormContext, useWatch } from "react-hook-form";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { useTranslate } from "~/hooks/use-translate";

export const HSN_PATTERN = /^[0-9]{4,8}$/;

/** The GST rate a new Variety starts with, and the rate after switching Exempt off. */
export const DEFAULT_GST_RATE_PERCENT = "5";

/** A Variety's GST: HSN, exempt and rate in basis points (5% is 500). */
export type VarietyTax = { hsn: string; exempt: boolean; gstRateBps: number };

export type TaxRateFieldValues = {
  hsn: string;
  exempt: boolean;
  ratePercent: string;
};

/** HSN, Exempt and GST rate, for any form whose values include TaxRateFieldValues. */
export function VarietyTaxRateFields() {
  const tx = useTranslate();
  const form = useFormContext<TaxRateFieldValues>();
  const exempt = useWatch({ control: form.control, name: "exempt" });

  return (
    <>
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
                className="rounded-xl bg-muted-soft"
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
                className="data-[state=checked]:bg-brand"
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // Exempt forces the rate to 0; switching back starts again from the default.
                  form.setValue("ratePercent", DEFAULT_GST_RATE_PERCENT);
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
                className="rounded-xl bg-muted-soft"
                {...field}
                value={exempt ? "0" : field.value}
                onBlur={() => {
                  field.onBlur();
                  // A 0% rate is Exempt: switch it on (switching off again starts from the default).
                  if (field.value.trim() !== "" && Number(field.value) === 0) {
                    form.setValue("exempt", true);
                    form.setValue("ratePercent", DEFAULT_GST_RATE_PERCENT);
                    form.clearErrors("ratePercent");
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
