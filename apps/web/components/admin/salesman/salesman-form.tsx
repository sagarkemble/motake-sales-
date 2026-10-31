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

const minPasswordLength = 8;

export type SalesmanFormValues = {
  name: string;
  phone: string;
  email: string;
  password: string;
};

interface SalesmanFormProps {
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: SalesmanFormValues) => void;
}

export function SalesmanForm({ isSubmitting, submitLabel, onSubmit }: SalesmanFormProps) {
  const tx = useTranslate();

  const salesmanFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, tx("admin.salesmen.validation.name")).max(120),
        phone: z.string().min(1, tx("admin.salesmen.validation.phone")).max(20),
        email: z
          .string()
          .min(1, tx("admin.salesmen.validation.email"))
          .email(tx("admin.salesmen.validation.emailInvalid")),
        password: z.string().min(minPasswordLength, tx("admin.salesmen.validation.passwordMin")),
      }),
    [tx],
  );

  const form = useForm<SalesmanFormValues>({
    resolver: zodResolver(salesmanFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      password: "",
    },
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

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.salesmen.form.phone")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={tx("common.fields.phone")}
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("common.fields.email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder={tx("admin.salesmen.form.emailPlaceholder")}
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
            name="password"
            render={({ field }) => {
              const remainingCharacters = minPasswordLength - field.value.length;
              const showRemainingCharactersHint = field.value.length > 0 && remainingCharacters > 0;
              return (
                <FormItem>
                  <FormLabel>{tx("common.fields.password")}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={tx("admin.salesmen.form.passwordPlaceholder")}
                      className="rounded-xl bg-muted/40"
                      {...field}
                    />
                  </FormControl>
                  {showRemainingCharactersHint && (
                    <p className="text-xs text-muted-foreground">
                      {tx(
                        remainingCharacters === 1
                          ? "admin.salesmen.form.moreCharsOne"
                          : "admin.salesmen.form.moreCharsOther",
                        { count: remainingCharacters },
                      )}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isSubmitting ? tx("common.status.pleaseWait") : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
