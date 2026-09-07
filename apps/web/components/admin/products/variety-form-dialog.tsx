"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import { getErrorMessage } from "~/lib/get-error-message";
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

const varietyFormSchema = z.object({
  sku: z.string().min(1, "Enter a SKU").max(64),
  name: z.string().min(1, "Enter a variety name").max(120),
  unit: z.string().min(1, "Enter a unit, e.g. kg or box").max(32),
  unitPrice: z.number().min(0, "Price must be 0 or more"),
});

export type VarietyFormValues = z.infer<typeof varietyFormSchema>;

interface VarietyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues?: VarietyFormValues;
  isSubmitting: boolean;
  onSubmit: (values: VarietyFormValues) => Promise<void>;
}

export function VarietyFormDialog({
  open,
  onOpenChange,
  defaultValues,
  isSubmitting,
  onSubmit,
}: VarietyFormDialogProps) {
  const tx = useTranslate();
  const form = useForm<VarietyFormValues>({
    resolver: zodResolver(varietyFormSchema),
    defaultValues: defaultValues ?? { sku: "", name: "", unit: "", unitPrice: 0 },
  });

  useEffect(() => {
    if (open) form.reset(defaultValues ?? { sku: "", name: "", unit: "", unitPrice: 0 });
  }, [open, defaultValues, form]);

  async function handleFormSubmit(values: VarietyFormValues) {
    try {
      await onSubmit(values);
    } catch (error) {
      const errorMessage = getErrorMessage(error, tx("Could not save variety. Try again."));
      if (errorMessage.toLowerCase().includes("sku")) {
        form.setError("sku", { message: errorMessage });
      } else {
        toast.error(errorMessage);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{defaultValues ? "Edit variety" : "Add variety"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Large" className="rounded-xl bg-muted/40" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SKU</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. PRD-001-L"
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
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. kg" className="rounded-xl bg-muted/40" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unitPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit price (₹)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className="rounded-xl bg-muted/40"
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(
                          event.target.value === "" ? 0 : Number(event.target.value),
                        )
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {isSubmitting ? "Saving" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
