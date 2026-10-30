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
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";

export type ProductFormValues = {
  name: string;
  description?: string;
  imageKey: string;
  imageUrl: string;
};

interface ProductFormProps {
  productId?: string;
  defaultValues?: Partial<ProductFormValues>;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => void;
}

export function ProductForm({
  productId,
  defaultValues,
  isSubmitting,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const tx = useTranslate();
  const { createImageUploadUrlAsync } = useProducts();

  const productFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, tx("admin.products.validation.nameRequired")).max(200),
        description: z.string().optional(),
        // A Product always has an image; the server refuses one without it too.
        imageKey: z.string().min(1),
        imageUrl: z.string().min(1, tx("admin.products.validation.imageRequired")),
      }),
    [tx],
  );

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      imageKey: defaultValues?.imageKey ?? "",
      imageUrl: defaultValues?.imageUrl ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="rounded-2xl border bg-card p-4">
          <FormField
            control={form.control}
            name="imageUrl"
            render={() => (
              <FormItem className="items-center">
                <FormControl>
                  <ImageUpload
                    imageUrl={form.watch("imageUrl") || null}
                    requestUploadUrl={createImageUploadUrlAsync}
                    altText={tx("admin.products.imageAlt")}
                    shape="square"
                    uploadButtonLabel={tx("admin.products.uploadImage")}
                    onUploaded={(result) => {
                      form.setValue("imageKey", result.imageKey);
                      form.setValue("imageUrl", result.imageUrl, { shouldValidate: true });
                    }}
                    // Only clears the form: Save needs a new image, and the server then drops the old one.
                    onDelete={async () => {
                      form.setValue("imageKey", "");
                      form.setValue("imageUrl", "");
                    }}
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
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("common.fields.name")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={tx("admin.products.namePlaceholder")}
                    className="rounded-xl bg-muted/40"
                    {...field}
                  />
                </FormControl>
                {productId && (
                  <p className="text-[11px] text-muted-foreground">
                    {tx("admin.products.renameKeepsSkus")}
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.products.description")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={tx("admin.products.descriptionPlaceholder")}
                    rows={4}
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
          {isSubmitting ? tx("common.status.pleaseWait") : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
