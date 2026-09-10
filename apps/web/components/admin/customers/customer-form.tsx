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
import { Textarea } from "~/components/ui/textarea";
import { ImageUpload } from "~/components/shared/image-upload";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";

export type CustomerFormValues = {
  shopName: string;
  contactName?: string;
  phone: string;
  address: string;
  notes?: string;
  shopPhotoKey: string;
  shopPhotoUrl: string;
};

interface CustomerFormProps {
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues>;
  isSubmitting: boolean;
  submitLabel: string;
  requireShopPhoto?: boolean;
  onSubmit: (values: CustomerFormValues) => void;
}

export function CustomerForm({
  customerId,
  defaultValues,
  isSubmitting,
  submitLabel,
  requireShopPhoto = true,
  onSubmit,
}: CustomerFormProps) {
  const tx = useTranslate();
  const { createShopPhotoUploadUrlAsync, deleteCustomerShopPhotoAsync } = useCustomers();

  const formSchema = useMemo(
    () =>
      z
        .object({
          shopName: z.string().min(1, tx("admin.customers.validation.shopName")).max(200),
          contactName: z.string().max(120).optional(),
          phone: z.string().min(1, tx("admin.customers.validation.phone")).max(20),
          address: z.string().min(1, tx("admin.customers.validation.address")),
          notes: z.string().optional(),
          shopPhotoKey: z.string(),
          shopPhotoUrl: z.string(),
        })
        .superRefine((values, context) => {
          if (requireShopPhoto && (!values.shopPhotoKey || !values.shopPhotoUrl)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: tx("admin.customers.validation.shopPhoto"),
              path: ["shopPhotoUrl"],
            });
          }
        }),
    [requireShopPhoto, tx],
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shopName: defaultValues?.shopName ?? "",
      contactName: defaultValues?.contactName ?? "",
      phone: defaultValues?.phone ?? "",
      address: defaultValues?.address ?? "",
      notes: defaultValues?.notes ?? "",
      shopPhotoKey: defaultValues?.shopPhotoKey ?? "",
      shopPhotoUrl: defaultValues?.shopPhotoUrl ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="rounded-2xl border bg-card p-4">
          <FormField
            control={form.control}
            name="shopPhotoUrl"
            render={() => (
              <FormItem className="items-center">
                <FormLabel>Shop photo{requireShopPhoto ? " *" : ""}</FormLabel>
                <FormControl>
                  <ImageUpload
                    imageUrl={form.watch("shopPhotoUrl") || null}
                    requestUploadUrl={createShopPhotoUploadUrlAsync}
                    altText="Shop"
                    shape="square"
                    uploadButtonLabel="salesman.checkout.customer.uploadPhoto"
                    onUploaded={(result) => {
                      form.setValue("shopPhotoKey", result.imageKey, { shouldValidate: true });
                      form.setValue("shopPhotoUrl", result.imageUrl, { shouldValidate: true });
                    }}
                    onDelete={
                      customerId || form.watch("shopPhotoUrl")
                        ? async () => {
                            if (customerId && defaultValues?.shopPhotoKey) {
                              await deleteCustomerShopPhotoAsync({ id: customerId });
                            }
                            form.setValue("shopPhotoKey", "", { shouldValidate: true });
                            form.setValue("shopPhotoUrl", "", { shouldValidate: true });
                          }
                        : undefined
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
          <FormField
            control={form.control}
            name="shopName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shop name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="salesman.checkout.customer.shopName" className="rounded-full bg-muted/40" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Contact name"
                    className="rounded-full bg-muted/40"
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
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Phone" className="rounded-full bg-muted/40" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="common.fields.address"
                    className="min-h-20 rounded-2xl bg-muted/40"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Optional notes"
                    className="min-h-20 rounded-2xl bg-muted/40"
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
          className="h-11 w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
