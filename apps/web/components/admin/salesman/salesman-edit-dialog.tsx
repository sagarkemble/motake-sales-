"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { getErrorMessage } from "~/lib/get-error-message";
import { useSalesmen } from "~/hooks/use-salesmen";

const salesmanEditFormSchema = z.object({
  name: z.string().min(1, "Enter a name").max(120),
  phone: z.string().min(1, "Enter a phone number").max(20),
  email: z.string().min(1, "Enter an email").email("Enter a valid email"),
  password: z.union([z.string().length(0), z.string().min(8)]).optional(),
});

type SalesmanEditFormValues = z.infer<typeof salesmanEditFormSchema>;

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
  const { updateSalesmanAccountAsync, isUpdatingSalesmanAccount } = useSalesmen();

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
      toast.success("Salesman updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update salesman. Try again."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit salesman</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
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
                    <Input placeholder="Phone number" {...field} />
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Leave blank to keep current password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={isUpdatingSalesmanAccount}
              className="mt-2 w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {isUpdatingSalesmanAccount ? "Saving" : "Save changes"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
