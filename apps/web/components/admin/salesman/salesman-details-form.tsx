"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useTranslate } from "~/hooks/use-translate";

export type SalesmanDetailsFormValues = {
  name: string;
};

interface SalesmanDetailsFormProps {
  defaultValues: SalesmanDetailsFormValues;
  isSubmitting: boolean;
  onSubmit: (values: SalesmanDetailsFormValues) => void;
}

export function SalesmanDetailsForm({
  defaultValues,
  isSubmitting,
  onSubmit,
}: SalesmanDetailsFormProps) {
  const tx = useTranslate();

  const salesmanDetailsFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, tx("admin.salesmen.validation.name")).max(120),
      }),
    [tx],
  );

  const form = useForm<SalesmanDetailsFormValues>({
    resolver: zodResolver(salesmanDetailsFormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("common.fields.name")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={tx("admin.salesmen.form.namePlaceholder")}
                    className="rounded-xl bg-muted/40"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isSubmitting ? tx("common.status.pleaseWait") : tx("admin.products.saveChanges")}
        </Button>
      </form>
    </Form>
  );
}
