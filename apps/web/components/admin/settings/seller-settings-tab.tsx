"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { INDIAN_STATES, type RouterOutputs } from "@repo/trpc/client";
import { AlertTriangleIcon, PencilIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { useSettings } from "~/hooks/use-settings";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";

import { SellerDocumentDetails } from "./seller-document-details";
import { SellerSettingsHistory } from "./settings-history";

type SellerSettings = NonNullable<RouterOutputs["settings"]["seller"]["get"]["data"]>;

// State code, PAN (5 letters, 4 digits, 1 letter), entity number, Z, check character.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type SellerFormValues = {
  legalName: string;
  address: string;
  state: string;
  gstin: string;
  phone: string;
  email: string;
};

const SELLER_SUMMARY_FIELDS = ["legalName", "address", "state", "gstin", "phone", "email"] as const;

export function SellerSettingsTab() {
  const tx = useTranslate();
  const {
    seller,
    isSellerLoading,
    isSellerError,
    refetchSeller,
    sellerSetupDefaults,
    isSellerSetupDefaultsLoading,
    setUpSellerAsync,
    isSettingUpSeller,
    updateSellerAsync,
    isUpdatingSeller,
  } = useSettings();
  const [isEditing, setIsEditing] = useState(false);

  async function handleSetUp(values: SellerFormValues) {
    try {
      await setUpSellerAsync(toSellerInput(values));
      toast.success(tx("admin.settings.seller.setUpSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.seller.setUpFailed")));
    }
  }

  async function handleUpdate(values: SellerFormValues) {
    try {
      await updateSellerAsync(toSellerInput(values));
      toast.success(tx("admin.settings.seller.updateSuccess"));
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.settings.seller.updateFailed")));
    }
  }

  if (isSellerLoading || isSellerSetupDefaultsLoading) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  if (isSellerError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{tx("admin.settings.loadFailed")}</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void refetchSeller()}
        >
          {tx("common.actions.tryAgain")}
        </Button>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 rounded-2xl bg-amber-500/10 p-3 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">{tx("admin.settings.seller.notSetUpTitle")}</p>
            <p className="text-muted-foreground">{tx("admin.settings.seller.notSetUpBody")}</p>
          </div>
        </div>
        <section className="rounded-2xl border bg-card p-4">
          <SellerForm
            mode="setup"
            defaultValues={sellerSetupDefaults ?? undefined}
            isSubmitting={isSettingUpSeller}
            onSubmit={handleSetUp}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-medium">{tx("admin.settings.seller.title")}</h2>
          {!isEditing && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => setIsEditing(true)}
            >
              <PencilIcon />
              {tx("admin.settings.seller.edit")}
            </Button>
          )}
        </div>
        {isEditing ? (
          <SellerForm
            mode="edit"
            defaultValues={{ ...seller, email: seller.email ?? "" }}
            isSubmitting={isUpdatingSeller}
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <SellerSummary seller={seller} />
        )}
      </section>
      <SellerDocumentDetails seller={seller} />
      <SellerSettingsHistory />
    </div>
  );
}

function toSellerInput(values: SellerFormValues) {
  return {
    legalName: values.legalName.trim(),
    address: values.address.trim(),
    state: values.state,
    gstin: values.gstin.trim().toUpperCase(),
    phone: values.phone.trim(),
    email: values.email.trim() || null,
  };
}

function SellerSummary({ seller }: { seller: SellerSettings }) {
  const tx = useTranslate();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      {SELLER_SUMMARY_FIELDS.map((field) => (
        <div key={field} className="contents">
          <dt className="text-muted-foreground">{tx(`admin.settings.fields.${field}`)}</dt>
          <dd className={cn("min-w-0 break-words", field === "gstin" && "font-mono")}>
            {seller[field] || <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface SellerFormProps {
  mode: "setup" | "edit";
  defaultValues?: Partial<SellerFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: SellerFormValues) => void;
  onCancel?: () => void;
}

function SellerForm({ mode, defaultValues, isSubmitting, onSubmit, onCancel }: SellerFormProps) {
  const tx = useTranslate();

  const formSchema = useMemo(
    () =>
      z
        .object({
          legalName: z
            .string()
            .trim()
            .min(1, tx("admin.settings.seller.validation.legalName"))
            .max(200, tx("admin.settings.seller.validation.legalName")),
          address: z.string().trim().min(1, tx("admin.settings.seller.validation.address")),
          state: z.string(),
          gstin: z.string(),
          phone: z
            .string()
            .trim()
            .min(1, tx("admin.settings.seller.validation.phone"))
            .max(20, tx("admin.settings.seller.validation.phone")),
          email: z.union([
            z.literal(""),
            z.string().trim().email(tx("admin.settings.seller.validation.email")).max(255),
          ]),
        })
        .superRefine((values, context) => {
          const state = INDIAN_STATES.find((candidate) => candidate.name === values.state);
          if (!state) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.seller.validation.state"),
              path: ["state"],
            });
          }
          const gstin = values.gstin.trim().toUpperCase();
          if (gstin.length !== 15) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.seller.validation.gstinLength"),
              path: ["gstin"],
            });
          } else if (!GSTIN_PATTERN.test(gstin)) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.seller.validation.gstinShape"),
              path: ["gstin"],
            });
          } else if (state && gstin.slice(0, 2) !== state.gstStateCode) {
            context.addIssue({
              code: "custom",
              message: tx("admin.settings.seller.validation.gstinState", {
                code: gstin.slice(0, 2),
                state: state.name,
                stateCode: state.gstStateCode,
              }),
              path: ["gstin"],
            });
          }
        }),
    [tx],
  );

  const form = useForm<SellerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      legalName: defaultValues?.legalName ?? "",
      address: defaultValues?.address ?? "",
      state: defaultValues?.state ?? "",
      gstin: defaultValues?.gstin ?? "",
      phone: defaultValues?.phone ?? "",
      email: defaultValues?.email ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {mode === "setup" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {tx("admin.settings.seller.prefilledHint")}
          </p>
        )}

        <FormField
          control={form.control}
          name="legalName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tx("admin.settings.fields.legalName")}</FormLabel>
              <FormControl>
                <Input {...field} className="rounded-xl bg-muted/40" />
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
              <FormLabel>{tx("admin.settings.fields.address")}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} className="min-h-16 rounded-xl bg-muted/40" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.settings.fields.state")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full rounded-xl bg-muted/40">
                      <SelectValue placeholder={tx("admin.settings.seller.statePlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state.name} value={state.name}>
                        {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gstin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.settings.fields.gstin")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={15}
                    autoCapitalize="characters"
                    className="rounded-xl bg-muted/40 font-mono uppercase"
                    onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{tx("admin.settings.fields.phone")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="tel"
                    maxLength={20}
                    className="rounded-xl bg-muted/40"
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
                <FormLabel>{tx("admin.settings.seller.emailOptional")}</FormLabel>
                <FormControl>
                  <Input {...field} type="email" className="rounded-xl bg-muted/40" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <p className="text-xs text-muted-foreground">{tx("admin.settings.seller.appliesNote")}</p>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90 sm:flex-1"
          >
            {isSubmitting
              ? tx("common.status.pleaseWait")
              : mode === "setup"
                ? tx("admin.settings.seller.confirm")
                : tx("admin.settings.seller.saveChanges")}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              {tx("common.actions.cancel")}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
