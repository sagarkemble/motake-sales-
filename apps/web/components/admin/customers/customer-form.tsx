"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LockIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { ImageUpload } from "~/components/shared/image-upload";
import { PreferredLanguagePicker } from "~/components/shared/preferred-language-picker";
import { RouteTag } from "~/components/shared/route-tag";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";
import { preferredLanguageLabelKey, type PreferredLanguage } from "~/lib/preferred-language";

import { RouteChoiceSelect } from "./route-choice-select";

const GSTIN_PATTERN = /^[A-Z0-9]{15}$/;

export type CustomerFormValues = {
  shopName: string;
  contactName?: string;
  phone: string;
  address: string;
  notes?: string;
  shopPhotoKey: string;
  shopPhotoUrl: string;
  routeId: string;
  preferredLanguage: PreferredLanguage;
  gstin: string;
  einvoicingRequired: boolean;
};

/** Set when the Customer was added and not editable here. */
export interface CustomerFixedDetails {
  routeName: string;
  routeCode: string;
  routeHidden: boolean;
  preferredLanguage: PreferredLanguage;
}

interface CustomerFormProps {
  mode: "create" | "edit";
  customerId?: string;
  defaultValues?: Partial<CustomerFormValues>;
  fixedDetails?: CustomerFixedDetails;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: CustomerFormValues) => void;
}

export function normalizeGstin(gstin: string): string {
  return gstin.trim().toUpperCase();
}

export function CustomerForm({
  mode,
  customerId,
  defaultValues,
  fixedDetails,
  isSubmitting,
  submitLabel,
  onSubmit,
}: CustomerFormProps) {
  const tx = useTranslate();
  const { createShopPhotoUploadUrlAsync, deleteCustomerShopPhotoAsync } = useCustomers();
  const isCreate = mode === "create";

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
          routeId: z.string(),
          preferredLanguage: z.enum(["mr", "hi", "en"]),
          gstin: z
            .string()
            .refine(
              (gstin) => !normalizeGstin(gstin) || GSTIN_PATTERN.test(normalizeGstin(gstin)),
              tx("admin.customers.validation.gstin"),
            ),
          einvoicingRequired: z.boolean(),
        })
        .superRefine((values, context) => {
          if (isCreate && (!values.shopPhotoKey || !values.shopPhotoUrl)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: tx("admin.customers.validation.shopPhoto"),
              path: ["shopPhotoUrl"],
            });
          }
          if (values.einvoicingRequired && !normalizeGstin(values.gstin)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: tx("admin.customers.validation.gstinForEinvoicing"),
              path: ["gstin"],
            });
          }
          if (isCreate && !values.routeId) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: tx("admin.customers.validation.route"),
              path: ["routeId"],
            });
          }
        }),
    [isCreate, tx],
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
      routeId: defaultValues?.routeId ?? "",
      preferredLanguage: defaultValues?.preferredLanguage ?? "mr",
      gstin: defaultValues?.gstin ?? "",
      einvoicingRequired: defaultValues?.einvoicingRequired ?? false,
    },
  });

  // E-invoicing required follows the GSTIN (on when one is entered) until the Admin sets it.
  const [isEinvoicingSetByAdmin, setIsEinvoicingSetByAdmin] = useState(
    () =>
      !isCreate &&
      (defaultValues?.einvoicingRequired ?? false) !== Boolean(defaultValues?.gstin?.trim()),
  );

  function handleGstinChange(gstin: string) {
    form.setValue("gstin", gstin, { shouldValidate: form.formState.isSubmitted });
    // Drops the "enter the GSTIN first" message from the e-invoicing switch once typing starts.
    if (!form.formState.isSubmitted) form.clearErrors("gstin");
    if (!isEinvoicingSetByAdmin) form.setValue("einvoicingRequired", gstin.trim().length > 0);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Two cards. Phone: photo card, then Route + language card. Wider: side by side, same height. */}
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="rounded-2xl border bg-card p-4">
            <FormField
              control={form.control}
              name="shopPhotoUrl"
              render={() => (
                <FormItem className="h-full content-center justify-items-center">
                  <FormLabel>
                    {isCreate
                      ? tx("salesman.checkout.customer.shopPhoto")
                      : tx("admin.customers.form.shopPhoto")}
                  </FormLabel>
                  <FormControl>
                    <ImageUpload
                      imageUrl={form.watch("shopPhotoUrl") || null}
                      requestUploadUrl={createShopPhotoUploadUrlAsync}
                      altText={tx("admin.customers.form.shopPhoto")}
                      shape="square"
                      uploadButtonLabel={tx("salesman.checkout.customer.uploadPhoto")}
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

          {isCreate ? (
            <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
              <FormField
                control={form.control}
                name="routeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tx("admin.customers.form.route")}</FormLabel>
                    <FormControl>
                      <RouteChoiceSelect value={field.value} onValueChange={field.onChange} />
                    </FormControl>
                    <FormDescription>{tx("admin.customers.form.routeHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tx("common.preferredLanguage.label")}</FormLabel>
                    <PreferredLanguagePicker value={field.value} onValueChange={field.onChange} />
                  </FormItem>
                )}
              />
            </div>
          ) : (
            fixedDetails && (
              <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {tx("admin.customers.form.fixedDetailsTitle")}
                  </p>
                  <Badge variant="outline" className="gap-1 text-muted-foreground">
                    <LockIcon className="size-3" />
                    {tx("admin.customers.form.fixedDetailsLabel")}
                  </Badge>
                </div>
                <dl className="grid gap-y-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {tx("admin.customers.form.route")}
                    </dt>
                    <dd className="min-w-0">
                      <RouteTag
                        name={fixedDetails.routeName}
                        code={fixedDetails.routeCode}
                        hidden={fixedDetails.routeHidden}
                      />
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">
                      {tx("common.preferredLanguage.label")}
                    </dt>
                    <dd>{tx(preferredLanguageLabelKey(fixedDetails.preferredLanguage))}</dd>
                  </div>
                </dl>
              </div>
            )
          )}
        </div>

        {/* Phone: one column. Wider: shop | contact, phone, address | notes. */}
        <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="shopName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("salesman.checkout.customer.shopName")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={tx("salesman.checkout.customer.shopNamePlaceholder")}
                    className="rounded-xl bg-muted/40"
                  />
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
                <FormLabel>{tx("admin.customers.form.contactName")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={tx("admin.customers.form.contactName")}
                    className="rounded-xl bg-muted/40"
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
                <FormLabel>{tx("common.fields.phone")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    placeholder={tx("salesman.checkout.customer.phonePlaceholder")}
                    className="rounded-xl bg-muted/40"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem className="sm:col-start-1">
                <FormLabel>{tx("common.fields.address")}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder={tx("salesman.checkout.customer.addressPlaceholder")}
                    className="min-h-20 rounded-xl bg-muted/40"
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
                <FormLabel>{tx("admin.customers.form.notes")}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder={tx("admin.customers.form.notesPlaceholder")}
                    className="min-h-20 rounded-xl bg-muted/40"
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
            name="gstin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.customers.form.gstin")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(event) => handleGstinChange(event.target.value)}
                    onBlur={() => {
                      field.onBlur();
                      form.setValue("gstin", normalizeGstin(field.value));
                    }}
                    placeholder="27AABCS1234F1Z5"
                    autoCapitalize="characters"
                    maxLength={20}
                    className="rounded-xl bg-muted/40 font-mono uppercase"
                  />
                </FormControl>
                <FormDescription>{tx("admin.customers.form.gstinHint")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="einvoicingRequired"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <FormLabel>{tx("admin.customers.form.einvoicing")}</FormLabel>
                  <FormDescription>
                    {isEinvoicingSetByAdmin ? (
                      <>
                        {tx("admin.customers.form.einvoicingSetByAdmin")}{" "}
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-xs text-brand"
                          onClick={() => {
                            setIsEinvoicingSetByAdmin(false);
                            form.setValue(
                              "einvoicingRequired",
                              form.getValues("gstin").trim().length > 0,
                            );
                          }}
                        >
                          {tx("admin.customers.form.einvoicingFollowGstin")}
                        </Button>
                      </>
                    ) : (
                      tx("admin.customers.form.einvoicingFollowsGstin")
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    className="data-[state=checked]:bg-brand"
                    onCheckedChange={(checked) => {
                      // E-invoicing needs a GSTIN: point at the empty field instead of switching on.
                      if (checked && !normalizeGstin(form.getValues("gstin"))) {
                        form.setError("gstin", {
                          message: tx("admin.customers.validation.gstinForEinvoicing"),
                        });
                        form.setFocus("gstin");
                        return;
                      }
                      setIsEinvoicingSetByAdmin(true);
                      field.onChange(checked);
                    }}
                  />
                </FormControl>
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
