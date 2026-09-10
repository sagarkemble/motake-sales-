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
  salesmanCode: string;
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
        email: z.string().min(1, tx("admin.salesmen.validation.email")).email(tx("admin.salesmen.validation.emailInvalid")),
        password: z.string().min(minPasswordLength, tx("admin.salesmen.validation.passwordMin")),
        salesmanCode: z.string().min(1, tx("admin.salesmen.validation.code")).max(32),
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
      salesmanCode: "",
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
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Full name" {...field} />
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
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="common.fields.phone" {...field} />
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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Email address" {...field} />
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="At least 8 characters" {...field} />
                  </FormControl>
                  {showRemainingCharactersHint && (
                    <p className="text-xs text-muted-foreground">
                      {remainingCharacters} more character{remainingCharacters === 1 ? "" : "s"} needed
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="salesmanCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salesman code</FormLabel>
                <FormControl>
                  <Input placeholder="Unique code" {...field} />
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
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
