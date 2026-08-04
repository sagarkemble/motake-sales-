"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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

const productFormSchema = z.object({
  name: z.string().min(1, "Enter a product name").max(200),
  description: z.string().optional(),
  imageKey: z.string().optional(),
  imageUrl: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

interface ProductFormProps {
  defaultValues?: Partial<ProductFormValues>;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => void;
}

export function ProductForm({
  defaultValues,
  isSubmitting,
  submitLabel,
  onSubmit,
}: ProductFormProps) {
  const { createImageUploadUrlAsync } = useProducts();
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
                    altText="Product"
                    shape="square"
                    uploadButtonLabel="Upload image"
                    onUploaded={(result) => {
                      form.setValue("imageKey", result.imageKey);
                      form.setValue("imageUrl", result.imageUrl);
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
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Product name" className="rounded-xl bg-muted/40" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Short description"
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
          className="w-full rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isSubmitting ? "Saving" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
