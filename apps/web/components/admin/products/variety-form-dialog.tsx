"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { TRPCClientError } from "@repo/trpc/client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { LockedSku } from "~/components/admin/products/sku-chip";
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
import { Label } from "~/components/ui/label";

const UNIT_SUGGESTIONS = ["pouch", "pack", "cup", "tin", "box", "kg"];

const emptyValues = { name: "", unit: "" };

export type VarietyFormValues = { name: string; unit: string };

interface VarietyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  /** The Variety being edited; omitted when adding one. */
  editing?: VarietyFormValues & { sku: string };
  isSubmitting: boolean;
  onSubmit: (values: VarietyFormValues) => Promise<void>;
}

export function VarietyFormDialog({
  open,
  onOpenChange,
  productName,
  editing,
  isSubmitting,
  onSubmit,
}: VarietyFormDialogProps) {
  const tx = useTranslate();
  const varietyFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, tx("admin.varieties.validation.nameRequired")).max(120),
        unit: z.string().trim().min(1, tx("admin.varieties.validation.unitRequired")).max(32),
      }),
    [tx],
  );
  const form = useForm<VarietyFormValues>({
    resolver: zodResolver(varietyFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) form.reset(editing ? { name: editing.name, unit: editing.unit } : emptyValues);
  }, [open, editing, form]);

  async function handleFormSubmit(values: VarietyFormValues) {
    try {
      await onSubmit(values);
    } catch (error) {
      const errorMessage = getErrorMessage(error, tx("admin.varieties.saveFailed"));
      // The server refuses a second Variety with the same name under this Product.
      if (error instanceof TRPCClientError && error.data?.code === "CONFLICT") {
        form.setError("name", { message: errorMessage });
      } else {
        toast.error(errorMessage);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tx(editing ? "admin.varieties.editTitle" : "admin.varieties.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{tx("admin.varieties.product")}</Label>
              <p className="rounded-xl border bg-muted/20 px-3 py-2 text-sm">{productName}</p>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 500 ml"
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
                    <Input
                      list="variety-unit-suggestions"
                      placeholder="e.g. pouch"
                      className="rounded-xl bg-muted/40"
                      {...field}
                    />
                  </FormControl>
                  <datalist id="variety-unit-suggestions">
                    {UNIT_SUGGESTIONS.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                  <FormMessage />
                </FormItem>
              )}
            />

            {editing ? (
              <LockedSku sku={editing.sku} />
            ) : (
              <p className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                {tx("admin.varieties.skuOnSave")}
              </p>
            )}

            <DialogFooter>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {isSubmitting
                  ? tx("common.status.pleaseWait")
                  : tx(editing ? "common.actions.save" : "admin.varieties.addTitle")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
