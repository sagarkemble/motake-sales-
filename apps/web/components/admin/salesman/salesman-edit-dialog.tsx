"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { getErrorMessage } from "~/lib/get-error-message";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";

const minPasswordLength = 8;

type SalesmanEditFormValues = {
  name: string;
  phone: string;
  email: string;
  password?: string;
};

interface SalesmanEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesmanId: string;
  defaultValues: { name: string; phone: string; email: string };
}

export function SalesmanEditDialog({
  open,
  onOpenChange,
  salesmanId,
  defaultValues,
}: SalesmanEditDialogProps) {
  const tx = useTranslate();
  const { updateSalesmanAccountAsync, isUpdatingSalesmanAccount } = useSalesmen();

  const salesmanEditFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, tx("admin.salesmen.validation.name")).max(120),
        phone: z.string().min(1, tx("admin.salesmen.validation.phone")).max(20),
        email: z
          .string()
          .min(1, tx("admin.salesmen.validation.email"))
          .email(tx("admin.salesmen.validation.emailInvalid")),
        password: z.union([z.string().length(0), z.string().min(minPasswordLength)]).optional(),
      }),
    [tx],
  );

  const form = useForm<SalesmanEditFormValues>({
    resolver: zodResolver(salesmanEditFormSchema),
    defaultValues: { ...defaultValues, password: "" },
  });

  useEffect(() => {
    if (open) form.reset({ ...defaultValues, password: "" });
  }, [open, defaultValues, form]);

  async function handleSubmit(values: SalesmanEditFormValues) {
    try {
      await updateSalesmanAccountAsync({
        id: salesmanId,
        name: values.name,
        phone: values.phone,
        email: values.email,
        password: values.password ? values.password : undefined,
      });
      toast.success(tx("admin.salesmen.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.salesmen.updateFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("admin.salesmen.editAria")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
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
                const passwordValue = field.value ?? "";
                const remainingCharacters = minPasswordLength - passwordValue.length;
                const showRemainingCharactersHint =
                  passwordValue.length > 0 && remainingCharacters > 0;
                return (
                  <FormItem>
                    <FormLabel>{tx("common.fields.password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={tx("admin.salesmen.form.passwordKeepPlaceholder")}
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

            <Button
              type="submit"
              disabled={isUpdatingSalesmanAccount}
              className="mt-2 w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isUpdatingSalesmanAccount
                ? tx("common.status.pleaseWait")
                : tx("admin.products.saveChanges")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
